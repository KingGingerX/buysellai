import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import {
  CATEGORIES,
  LEGAL_PAGES,
  LICENSES,
  addCartItem,
  adminDashboard,
  authenticateUser,
  blankStore,
  buyerDashboard,
  clearSession,
  createDmcaNotice,
  createListing,
  createSession,
  createCopyrightComplaint,
  decideRefund,
  findUserByToken,
  markOrderPaid,
  presentCart,
  prepareCheckoutOrder,
  publicUser,
  recordCheckoutSession,
  recordRefundProcessorResult,
  registerUser,
  removeCartItem,
  requestRefund,
  searchListings,
  sellerDashboard,
  verifyStripeWebhookSignature
} from "../src/marketplace.mjs";

const root = process.cwd();
const dataDirectory = join(root, "data");
const storePath = join(dataDirectory, "store.json");
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 4173);
const types = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"]
]);

let store = await loadStore();
let writeQueue = Promise.resolve();

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

    if (request.method === "GET" && url.pathname === "/healthz") {
      sendJson(response, 200, {
        service: "buysellai.store",
        status: "ok",
        time: new Date().toISOString()
      });
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    await serveStatic(response, url.pathname);
  } catch (error) {
    sendJson(response, 500, { error: "Internal server error.", requestId: Date.now().toString(36) });
    process.stderr.write(`${error.stack}\n`);
  }
});

server.listen(port, host, () => {
  process.stdout.write(`BuySellAI.store available at http://${host}:${port}\n`);
});

async function handleApi(request, response, url) {
  if (!sameOrigin(request)) {
    sendJson(response, 403, { error: "Cross-origin state changes are blocked." });
    return;
  }

  const token = readCookie(request, "bsa_session");
  const user = findUserByToken(store, token);

  if (request.method === "GET" && url.pathname === "/api/bootstrap") {
    sendJson(response, 200, {
      categories: CATEGORIES,
      legalPages: LEGAL_PAGES,
      licenses: LICENSES,
      user: publicUser(user)
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/register") {
    const result = registerUser(store, await readJson(request));
    if (!result.ok) {
      sendJson(response, 400, { error: result.error });
      return;
    }

    const session = createSession(store, result.user.id);
    await persistStore();
    setSessionCookie(response, session.token);
    sendJson(response, 201, { user: publicUser(result.user) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    const result = authenticateUser(store, await readJson(request));
    if (!result.ok) {
      sendJson(response, 401, { error: result.error });
      return;
    }

    const session = createSession(store, result.user.id);
    await persistStore();
    setSessionCookie(response, session.token);
    sendJson(response, 200, { user: publicUser(result.user) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    clearSession(store, token);
    await persistStore();
    response.setHeader("Set-Cookie", "bsa_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/listings") {
    sendJson(response, 200, {
      listings: searchListings(store, {
        category: url.searchParams.get("category") ?? "all",
        license: url.searchParams.get("license") ?? "all",
        search: url.searchParams.get("search") ?? ""
      }, user)
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/listings") {
    const result = createListing(store, await readJson(request), user);
    if (!result.ok) {
      sendJson(response, user ? 400 : 401, { error: result.error });
      return;
    }

    await persistStore();
    sendJson(response, 201, { listing: result.listing });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/cart") {
    if (!user) {
      sendJson(response, 401, { error: "Account access is required." });
      return;
    }

    sendJson(response, 200, { cart: presentCart(store, user) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/cart/add") {
    const result = addCartItem(store, user, (await readJson(request)).listingId);
    if (!result.ok) {
      sendJson(response, user ? 400 : 401, { error: result.error });
      return;
    }

    await persistStore();
    sendJson(response, 200, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/cart/remove") {
    const result = removeCartItem(store, user, (await readJson(request)).listingId);
    if (!result.ok) {
      sendJson(response, user ? 400 : 401, { error: result.error });
      return;
    }

    await persistStore();
    sendJson(response, 200, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/checkout") {
    await handleCheckout(response, user);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/dashboard/buyer") {
    requireRole(response, user, ["buyer", "admin"], () => sendJson(response, 200, buyerDashboard(store, user)));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/dashboard/seller") {
    requireRole(response, user, ["seller", "admin"], () => sendJson(response, 200, sellerDashboard(store, user)));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/dashboard/admin") {
    requireRole(response, user, ["admin"], () => sendJson(response, 200, adminDashboard(store)));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/stripe/connect") {
    await handleStripeConnect(response, user);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/stripe/webhook") {
    await handleStripeWebhook(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/refunds/request") {
    const result = requestRefund(store, user, await readJson(request));
    if (!result.ok) {
      sendJson(response, user ? 400 : 401, { error: result.error });
      return;
    }

    await persistStore();
    sendJson(response, 201, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/refunds/decide") {
    const result = decideRefund(store, user, await readJson(request));
    if (!result.ok) {
      sendJson(response, user ? 400 : 401, { error: result.error });
      return;
    }

    if (result.refundRequest.status === "approved") {
      await handleApprovedRefund(response, result.refundRequest);
      return;
    }

    await persistStore();
    sendJson(response, 200, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/dmca") {
    const result = createDmcaNotice(store, normalizeComplaintBooleans(await readJson(request)));
    if (!result.ok) {
      sendJson(response, 400, { error: result.error });
      return;
    }

    await persistStore();
    sendJson(response, 201, { complaint: result.complaint });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/copyright-complaints") {
    const result = createCopyrightComplaint(store, await readJson(request));
    if (!result.ok) {
      sendJson(response, 400, { error: result.error });
      return;
    }

    await persistStore();
    sendJson(response, 201, { complaint: result.complaint });
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/legal/")) {
    const page = LEGAL_PAGES.find((entry) => entry.id === url.pathname.split("/").pop());
    if (!page) {
      sendJson(response, 404, { error: "Legal page was not found." });
      return;
    }

    sendJson(response, 200, { page });
    return;
  }

  sendJson(response, 404, { error: "Route was not found." });
}

async function handleCheckout(response, user) {
  const prepared = prepareCheckoutOrder(store, user);
  if (!prepared.ok) {
    sendJson(response, user ? 400 : 401, { error: prepared.error });
    return;
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  const successUrl = process.env.STRIPE_CHECKOUT_SUCCESS_URL;
  const cancelUrl = process.env.STRIPE_CHECKOUT_CANCEL_URL;
  if (!secret || !successUrl || !cancelUrl) {
    sendJson(response, 503, {
      error: "Stripe Checkout is not configured. Set STRIPE_SECRET_KEY, STRIPE_CHECKOUT_SUCCESS_URL, and STRIPE_CHECKOUT_CANCEL_URL."
    });
    return;
  }

  const checkoutSession = await createStripeCheckoutSession(secret, prepared.order, prepared.seller, successUrl, cancelUrl);
  const order = recordCheckoutSession(store, prepared.order, checkoutSession);
  await persistStore();
  sendJson(response, 201, { checkoutUrl: checkoutSession.url, order });
}

async function handleStripeConnect(response, user) {
  if (!user || !["seller", "admin"].includes(user.role)) {
    sendJson(response, 401, { error: "Seller account access is required." });
    return;
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  const refreshUrl = process.env.STRIPE_CONNECT_REFRESH_URL;
  const returnUrl = process.env.STRIPE_CONNECT_RETURN_URL;

  if (!secret || !refreshUrl || !returnUrl) {
    user.stripeConnectStatus = "configuration_required";
    await persistStore();
    sendJson(response, 503, {
      error: "Stripe Connect is not configured. Set STRIPE_SECRET_KEY, STRIPE_CONNECT_REFRESH_URL, and STRIPE_CONNECT_RETURN_URL."
    });
    return;
  }

  const accountId = user.stripeAccountId ?? (await createStripeAccount(secret, user.email));
  user.stripeAccountId = accountId;
  user.stripeConnectStatus = "onboarding_started";
  const onboardingUrl = await createStripeAccountLink(secret, accountId, refreshUrl, returnUrl);
  await persistStore();
  sendJson(response, 200, { onboardingUrl, stripeAccountId: accountId });
}

async function createStripeAccount(secret, email) {
  const body = new URLSearchParams({
    "capabilities[card_payments][requested]": "true",
    "capabilities[transfers][requested]": "true",
    country: "US",
    email,
    type: "express"
  });
  const result = await stripeRequest(secret, "https://api.stripe.com/v1/accounts", body);
  return result.id;
}

async function createStripeAccountLink(secret, accountId, refreshUrl, returnUrl) {
  const body = new URLSearchParams({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding"
  });
  const result = await stripeRequest(secret, "https://api.stripe.com/v1/account_links", body);
  return result.url;
}

async function createStripeCheckoutSession(secret, order, seller, successUrl, cancelUrl) {
  const body = new URLSearchParams({
    cancel_url: cancelUrl,
    mode: "payment",
    "payment_intent_data[application_fee_amount]": String(order.platformFee * 100),
    "payment_intent_data[transfer_data][destination]": seller.stripeAccountId,
    success_url: successUrl
  });

  order.items.forEach((item, index) => {
    body.set(`line_items[${index}][price_data][currency]`, "usd");
    body.set(`line_items[${index}][price_data][product_data][name]`, item.title);
    body.set(`line_items[${index}][price_data][unit_amount]`, String(item.price * 100));
    body.set(`line_items[${index}][quantity]`, "1");
  });

  body.set("metadata[order_id]", order.id);
  body.set("metadata[seller_id]", order.sellerId);
  return stripeRequest(secret, "https://api.stripe.com/v1/checkout/sessions", body);
}

async function handleStripeWebhook(request, response) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    sendJson(response, 503, { error: "Stripe webhook secret is not configured." });
    return;
  }

  const rawBody = await readRawBody(request);
  const signature = request.headers["stripe-signature"];
  if (!verifyStripeWebhookSignature(rawBody, signature, secret)) {
    sendJson(response, 400, { error: "Invalid Stripe signature." });
    return;
  }

  const event = JSON.parse(rawBody);
  if (event.type === "checkout.session.completed") {
    const result = markOrderPaid(store, event.data.object);
    if (result.ok) {
      await persistStore();
    }
  }

  sendJson(response, 200, { received: true });
}

async function handleApprovedRefund(response, refundRequest) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    refundRequest.processorStatus = "configuration_required";
    await persistStore();
    sendJson(response, 503, {
      error: "Refund was seller-approved but Stripe is not configured. Seller liability remains open until processor refund succeeds."
    });
    return;
  }

  const order = store.orders.find((entry) => entry.id === refundRequest.orderId);
  if (!order?.stripePaymentIntentId) {
    refundRequest.processorStatus = "payment_intent_missing";
    await persistStore();
    sendJson(response, 409, {
      error: "Refund was seller-approved but the order has no Stripe payment intent. Seller liability remains open."
    });
    return;
  }

  const processorRefund = await createStripeRefund(secret, order.stripePaymentIntentId, refundRequest.amount);
  const result = recordRefundProcessorResult(store, refundRequest.id, processorRefund);
  await persistStore();
  sendJson(response, 200, result);
}

async function createStripeRefund(secret, paymentIntentId, amount) {
  const body = new URLSearchParams({
    amount: String(amount * 100),
    payment_intent: paymentIntentId,
    reason: "requested_by_customer"
  });
  return stripeRequest(secret, "https://api.stripe.com/v1/refunds", body);
}

async function stripeRequest(secret, url, body) {
  const response = await fetch(url, {
    body,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    method: "POST"
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Stripe request failed.");
  }

  return payload;
}

async function serveStatic(response, pathname) {
  const assetPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(root, assetPath));

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const file = await stat(filePath);
    if (!file.isFile()) {
      throw new Error("Not a file");
    }

    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": types.get(extname(filePath)) ?? "application/octet-stream"
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

async function loadStore() {
  await mkdir(dataDirectory, { recursive: true });

  try {
    return { ...blankStore(), ...JSON.parse(await readFile(storePath, "utf8")) };
  } catch {
    const fresh = blankStore();
    await writeFile(storePath, `${JSON.stringify(fresh, null, 2)}\n`);
    return fresh;
  }
}

function persistStore() {
  writeQueue = writeQueue.then(() => writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`));
  return writeQueue;
}

async function readJson(request) {
  const body = await readRawBody(request);
  return body ? JSON.parse(body) : {};
}

async function readRawBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 100000) {
      throw new Error("Request body too large.");
    }
  }

  return body;
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

function setSessionCookie(response, token) {
  response.setHeader("Set-Cookie", `bsa_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=1209600`);
}

function readCookie(request, name) {
  const cookie = request.headers.cookie ?? "";
  const match = cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : "";
}

function sameOrigin(request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method ?? "")) {
    return true;
  }

  const origin = request.headers.origin;
  if (!origin) {
    return true;
  }

  const host = request.headers.host;
  return origin === `http://${host}` || origin === `https://${host}`;
}

function requireRole(response, user, roles, handler) {
  if (!user) {
    sendJson(response, 401, { error: "Account access is required." });
    return;
  }

  if (!roles.includes(user.role)) {
    sendJson(response, 403, { error: "This account does not have access." });
    return;
  }

  handler();
}

function normalizeComplaintBooleans(input) {
  return {
    ...input,
    accuracy: input.accuracy === true || input.accuracy === "on",
    goodFaith: input.goodFaith === true || input.goodFaith === "on"
  };
}
