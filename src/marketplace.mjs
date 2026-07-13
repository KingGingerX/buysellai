import { createHash, createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

export const CATEGORIES = Object.freeze([
  { id: "agents", name: "AI Agents", description: "Packaged agent workflows and operators" },
  { id: "automations", name: "Automations", description: "Business process and revenue workflows" },
  { id: "prompts", name: "Prompt Systems", description: "Structured prompt libraries and playbooks" },
  { id: "datasets", name: "Datasets", description: "Licensed data products for AI work" },
  { id: "services", name: "Services", description: "Implementation and optimization offers" }
]);

export const LICENSES = Object.freeze([
  { id: "personal", name: "Personal Use" },
  { id: "commercial", name: "Commercial Use" },
  { id: "resale", name: "Resale Rights" },
  { id: "enterprise", name: "Enterprise Terms" }
]);

export const LEGAL_PAGES = Object.freeze([
  {
    id: "terms",
    title: "Terms of Service",
    body:
      "BuySellAI.store enables account holders to list and buy AI assets subject to verified ownership, lawful use, and marketplace review. Buyers receive only the license rights stated on the listing and order record."
  },
  {
    id: "privacy",
    title: "Privacy Policy",
    body:
      "The application stores account, listing, order, payout onboarding, and complaint records needed to operate the marketplace. Payment secrets and card data must remain with the configured payment processor."
  },
  {
    id: "seller-policy",
    title: "Seller Policy",
    body:
      "Sellers must own or control every listed asset, provide accurate deliverables, maintain support commitments, and complete payout onboarding before receiving funds."
  },
  {
    id: "buyer-policy",
    title: "Buyer Policy",
    body:
      "Buyers must review license scope, support windows, and deliverables before purchase. Account access is required before prices, seller identity, cart, and orders are shown."
  },
  {
    id: "dmca",
    title: "DMCA Process",
    body:
      "Copyright owners may file a notice through the DMCA workflow. Notices are recorded, reviewed by admins, and tied to the referenced listing or material."
  },
  {
    id: "refunds",
    title: "Refund Policy",
    body:
      "Refund responsibility belongs to the seller of record. BuySellAI.store records requests, seller decisions, payment processor outcomes, and audit history without assuming seller refund liability."
  }
]);

export function blankStore() {
  return {
    carts: [],
    complaints: [],
    listings: [],
    orders: [],
    payoutLedger: [],
    refundRequests: [],
    sessions: [],
    users: []
  };
}

export function publicUser(user) {
  if (!user) {
    return null;
  }

  return {
    email: user.email,
    id: user.id,
    name: user.name,
    role: user.role,
    stripeAccountId: user.stripeAccountId ?? null,
    stripeConnectStatus: user.stripeConnectStatus ?? "not_started"
  };
}

export function registerUser(store, input) {
  const email = normalizeEmail(input.email);
  const name = normalizeText(input.name);
  const password = String(input.password ?? "");
  const requestedRole = normalizeText(input.role);
  const firstUser = store.users.length === 0;
  const role = firstUser ? "admin" : requestedRole;

  if (name.length < 2 || name.length > 80) {
    return failure("Name must be between 2 and 80 characters.");
  }

  if (!isEmail(email)) {
    return failure("A valid email address is required.");
  }

  if (password.length < 12) {
    return failure("Password must be at least 12 characters.");
  }

  if (!["buyer", "seller", "admin"].includes(role)) {
    return failure("Choose buyer or seller account type.");
  }

  if (store.users.some((user) => user.email === email)) {
    return failure("An account already exists for this email.");
  }

  const user = {
    createdAt: timestamp(),
    email,
    id: makeId("user"),
    name,
    passwordHash: hashPassword(password),
    role,
    stripeConnectStatus: role === "seller" ? "not_started" : "not_required"
  };
  store.users.push(user);
  return { ok: true, user };
}

export function authenticateUser(store, input) {
  const email = normalizeEmail(input.email);
  const password = String(input.password ?? "");
  const user = store.users.find((entry) => entry.email === email);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return failure("Invalid email or password.");
  }

  return { ok: true, user };
}

export function createSession(store, userId) {
  const token = randomBytes(32).toString("hex");
  const session = {
    createdAt: timestamp(),
    expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 14,
    id: makeId("session"),
    tokenHash: sha256(token),
    userId
  };
  store.sessions.push(session);
  return { session, token };
}

export function findUserByToken(store, token) {
  if (!token) {
    return null;
  }

  const tokenHash = sha256(token);
  const session = store.sessions.find((entry) => entry.tokenHash === tokenHash && entry.expiresAt > Date.now());

  if (!session) {
    return null;
  }

  return store.users.find((user) => user.id === session.userId) ?? null;
}

export function clearSession(store, token) {
  const tokenHash = sha256(token ?? "");
  store.sessions = store.sessions.filter((session) => session.tokenHash !== tokenHash);
}

export function createListing(store, input, seller) {
  if (!seller || !["seller", "admin"].includes(seller.role)) {
    return failure("Seller account access is required.");
  }

  const title = normalizeText(input.title);
  const category = normalizeText(input.category);
  const license = normalizeText(input.license);
  const supportWindow = normalizeText(input.supportWindow);
  const proof = normalizeText(input.proof);
  const deliverables = normalizeText(input.deliverables);
  const price = Number(input.price);

  if (title.length < 4 || title.length > 80) {
    return failure("Asset name must be between 4 and 80 characters.");
  }

  if (!CATEGORIES.some((item) => item.id === category)) {
    return failure("Choose a supported marketplace category.");
  }

  if (!LICENSES.some((item) => item.id === license)) {
    return failure("Choose a supported license model.");
  }

  if (!Number.isFinite(price) || price < 1 || price > 50000) {
    return failure("Price must be between 1 and 50000 USD.");
  }

  if (proof.length < 24 || deliverables.length < 24 || supportWindow.length < 3) {
    return failure("Proof, deliverables, and support terms must be specific.");
  }

  const listing = {
    category,
    createdAt: timestamp(),
    deliverables,
    id: makeId("listing"),
    license,
    price: Math.round(price),
    proof,
    sellerId: seller.id,
    status: "active",
    supportWindow,
    title
  };
  store.listings.unshift(listing);
  return { listing, ok: true };
}

export function searchListings(store, filters, viewer) {
  const query = normalizeText(filters.search).toLowerCase();
  const category = filters.category ?? "all";
  const license = filters.license ?? "all";

  return store.listings
    .filter((listing) => listing.status === "active")
    .filter((listing) => category === "all" || listing.category === category)
    .filter((listing) => license === "all" || listing.license === license)
    .filter((listing) => {
      if (query.length === 0) {
        return true;
      }

      return [listing.title, listing.proof, listing.deliverables].join(" ").toLowerCase().includes(query);
    })
    .map((listing) => presentListing(store, listing, viewer));
}

export function addCartItem(store, buyer, listingId) {
  if (!buyer || !["buyer", "admin"].includes(buyer.role)) {
    return failure("Buyer account access is required.");
  }

  const listing = store.listings.find((entry) => entry.id === listingId && entry.status === "active");
  if (!listing) {
    return failure("Listing was not found.");
  }

  const cart = getOrCreateCart(store, buyer.id);
  if (!cart.listingIds.includes(listingId)) {
    cart.listingIds.push(listingId);
    cart.updatedAt = timestamp();
  }

  return { cart: presentCart(store, buyer), ok: true };
}

export function removeCartItem(store, buyer, listingId) {
  if (!buyer) {
    return failure("Account access is required.");
  }

  const cart = getOrCreateCart(store, buyer.id);
  cart.listingIds = cart.listingIds.filter((id) => id !== listingId);
  cart.updatedAt = timestamp();
  return { cart: presentCart(store, buyer), ok: true };
}

export function presentCart(store, buyer) {
  const cart = getOrCreateCart(store, buyer.id);
  const items = cart.listingIds
    .map((id) => store.listings.find((listing) => listing.id === id && listing.status === "active"))
    .filter(Boolean)
    .map((listing) => presentListing(store, listing, buyer));

  return {
    items,
    total: items.reduce((sum, item) => sum + (item.price ?? 0), 0)
  };
}

export function buyerDashboard(store, buyer) {
  return {
    cart: presentCart(store, buyer),
    orders: store.orders.filter((order) => order.buyerId === buyer.id),
    refundRequests: store.refundRequests.filter((request) => request.buyerId === buyer.id)
  };
}

export function sellerDashboard(store, seller) {
  const listings = store.listings.filter((listing) => listing.sellerId === seller.id);
  const listingIds = new Set(listings.map((listing) => listing.id));
  return {
    listings: listings.map((listing) => presentListing(store, listing, seller)),
    orders: store.orders.filter((order) => order.items.some((item) => listingIds.has(item.listingId))),
    refundRequests: store.refundRequests.filter((request) => request.sellerId === seller.id),
    payouts: {
      ledger: store.payoutLedger.filter((entry) => entry.sellerId === seller.id),
      stripeAccountId: seller.stripeAccountId ?? null,
      stripeConnectStatus: seller.stripeConnectStatus ?? "not_started"
    }
  };
}

export function adminDashboard(store) {
  return {
    complaints: store.complaints,
    listings: store.listings.map((listing) => presentListing(store, listing, { role: "admin" })),
    orders: store.orders,
    payoutLedger: store.payoutLedger,
    refundRequests: store.refundRequests,
    users: store.users.map(publicUser)
  };
}

export function prepareCheckoutOrder(store, buyer) {
  if (!buyer || !["buyer", "admin"].includes(buyer.role)) {
    return failure("Buyer account access is required.");
  }

  const cart = presentCart(store, buyer);
  if (cart.items.length === 0) {
    return failure("Cart is empty.");
  }

  const sellerIds = new Set(cart.items.map((item) => item.seller.id));
  if (sellerIds.size !== 1) {
    return failure("Checkout supports one seller at a time. Remove mixed-seller items before checkout.");
  }

  const sellerId = [...sellerIds][0];
  const seller = store.users.find((user) => user.id === sellerId);
  if (!seller?.stripeAccountId || seller.stripeConnectStatus !== "onboarding_started") {
    return failure("Seller payout account is not ready for checkout.");
  }

  const total = cart.total;
  const platformFee = Math.round(total * 0.1);
  const order = {
    buyerId: buyer.id,
    createdAt: timestamp(),
    fulfillmentStatus: "locked",
    id: makeId("order"),
    items: cart.items.map((item) => ({
      license: item.license,
      listingId: item.id,
      price: item.price,
      sellerId,
      title: item.title
    })),
    platformFee,
    sellerId,
    status: "checkout_pending",
    total
  };

  return { ok: true, order, seller };
}

export function recordCheckoutSession(store, order, checkoutSession) {
  order.status = "checkout_created";
  order.stripeCheckoutSessionId = checkoutSession.id;
  order.stripeCheckoutUrl = checkoutSession.url;
  store.orders.unshift(order);
  return order;
}

export function markOrderPaid(store, stripeSession) {
  const order = store.orders.find((entry) => entry.stripeCheckoutSessionId === stripeSession.id);
  if (!order) {
    return failure("Order was not found for checkout session.");
  }

  order.status = "paid";
  order.fulfillmentStatus = "available";
  order.paidAt = timestamp();
  order.stripePaymentIntentId = stripeSession.payment_intent ?? order.stripePaymentIntentId ?? null;

  if (!store.payoutLedger.some((entry) => entry.orderId === order.id)) {
    store.payoutLedger.unshift({
      amount: order.total - order.platformFee,
      createdAt: timestamp(),
      currency: "usd",
      id: makeId("payout"),
      orderId: order.id,
      sellerId: order.sellerId,
      status: "stripe_destination_charge",
      stripePaymentIntentId: order.stripePaymentIntentId
    });
  }

  const cart = store.carts.find((entry) => entry.buyerId === order.buyerId);
  if (cart) {
    cart.listingIds = cart.listingIds.filter((id) => !order.items.some((item) => item.listingId === id));
    cart.updatedAt = timestamp();
  }

  return { ok: true, order };
}

export function requestRefund(store, buyer, input) {
  if (!buyer || !["buyer", "admin"].includes(buyer.role)) {
    return failure("Buyer account access is required.");
  }

  const order = store.orders.find((entry) => entry.id === normalizeText(input.orderId) && entry.buyerId === buyer.id);
  if (!order) {
    return failure("Order was not found.");
  }

  if (order.status !== "paid") {
    return failure("Refunds can only be requested after payment is confirmed.");
  }

  if (store.refundRequests.some((entry) => entry.orderId === order.id && ["requested", "approved"].includes(entry.status))) {
    return failure("A refund request is already open for this order.");
  }

  const reason = normalizeText(input.reason);
  if (reason.length < 24 || reason.length > 1000) {
    return failure("Refund reason must be between 24 and 1000 characters.");
  }

  const request = {
    amount: order.total,
    buyerId: buyer.id,
    createdAt: timestamp(),
    id: makeId("refund"),
    liability: "seller",
    orderId: order.id,
    reason,
    sellerId: order.sellerId,
    status: "requested"
  };
  store.refundRequests.unshift(request);
  return { ok: true, refundRequest: request };
}

export function decideRefund(store, seller, input) {
  if (!seller || !["seller", "admin"].includes(seller.role)) {
    return failure("Seller account access is required.");
  }

  const request = store.refundRequests.find((entry) => entry.id === normalizeText(input.refundRequestId));
  if (!request) {
    return failure("Refund request was not found.");
  }

  if (request.sellerId !== seller.id && seller.role !== "admin") {
    return failure("Only the seller of record can decide this refund.");
  }

  if (request.status !== "requested") {
    return failure("Refund request is no longer awaiting a seller decision.");
  }

  const decision = normalizeText(input.decision);
  const note = normalizeText(input.note);
  if (!["approve", "reject"].includes(decision)) {
    return failure("Decision must be approve or reject.");
  }

  if (note.length < 12 || note.length > 1000) {
    return failure("Seller decision note must be between 12 and 1000 characters.");
  }

  request.decidedAt = timestamp();
  request.decisionNote = note;
  request.status = decision === "approve" ? "approved" : "rejected";
  return { ok: true, refundRequest: request };
}

export function recordRefundProcessorResult(store, refundRequestId, processorRefund) {
  const request = store.refundRequests.find((entry) => entry.id === refundRequestId);
  if (!request) {
    return failure("Refund request was not found.");
  }

  request.processorRefundId = processorRefund.id;
  request.processorStatus = processorRefund.status;
  request.refundedAt = timestamp();
  request.status = "processed";

  const order = store.orders.find((entry) => entry.id === request.orderId);
  if (order) {
    order.status = "refunded";
    order.fulfillmentStatus = "revoked";
  }

  return { ok: true, refundRequest: request };
}

export function verifyStripeWebhookSignature(payload, signatureHeader, secret, now = Math.floor(Date.now() / 1000)) {
  if (!signatureHeader || !secret) {
    return false;
  }

  const parts = Object.fromEntries(signatureHeader.split(",").map((part) => part.split("=")));
  const timestampValue = Number(parts.t);
  const signature = parts.v1;

  if (!Number.isFinite(timestampValue) || Math.abs(now - timestampValue) > 300 || !signature) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(`${timestampValue}.${payload}`).digest("hex");
  const actualBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function createDmcaNotice(store, input) {
  const required = {
    claimantEmail: normalizeEmail(input.claimantEmail),
    claimantName: normalizeText(input.claimantName),
    infringingMaterial: normalizeText(input.infringingMaterial),
    listingReference: normalizeText(input.listingReference),
    workDescription: normalizeText(input.workDescription)
  };

  if (!isEmail(required.claimantEmail) || required.claimantName.length < 2) {
    return failure("Claimant name and valid email are required.");
  }

  if (
    required.listingReference.length < 4 ||
    required.workDescription.length < 24 ||
    required.infringingMaterial.length < 24
  ) {
    return failure("Listing reference, work, and disputed material details are required.");
  }

  if (input.goodFaith !== true || input.accuracy !== true) {
    return failure("Good-faith and accuracy certifications are required.");
  }

  return createComplaint(store, "dmca", required);
}

export function createCopyrightComplaint(store, input) {
  const required = {
    details: normalizeText(input.details),
    listingReference: normalizeText(input.listingReference),
    reporterEmail: normalizeEmail(input.reporterEmail),
    reporterName: normalizeText(input.reporterName)
  };

  if (!isEmail(required.reporterEmail) || required.reporterName.length < 2) {
    return failure("Reporter name and valid email are required.");
  }

  if (required.listingReference.length < 4 || required.details.length < 24) {
    return failure("Listing reference and complaint details are required.");
  }

  return createComplaint(store, "copyright", required);
}

export function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency"
  }).format(value);
}

export function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function presentListing(store, listing, viewer) {
  const authenticated = Boolean(viewer);
  const seller = store.users.find((user) => user.id === listing.sellerId);
  const canSeeSeller = authenticated;
  const canSeePrice = authenticated;

  return {
    category: listing.category,
    createdAt: listing.createdAt,
    deliverables: listing.deliverables,
    id: listing.id,
    license: listing.license,
    price: canSeePrice ? listing.price : null,
    priceLocked: !canSeePrice,
    proof: listing.proof,
    seller: canSeeSeller && seller ? publicUser(seller) : null,
    sellerLocked: !canSeeSeller,
    status: listing.status,
    supportWindow: listing.supportWindow,
    title: listing.title
  };
}

function getOrCreateCart(store, buyerId) {
  let cart = store.carts.find((entry) => entry.buyerId === buyerId);
  if (!cart) {
    cart = {
      buyerId,
      createdAt: timestamp(),
      listingIds: [],
      updatedAt: timestamp()
    };
    store.carts.push(cart);
  }

  return cart;
}

function createComplaint(store, type, payload) {
  const complaint = {
    createdAt: timestamp(),
    id: makeId("complaint"),
    payload,
    status: "submitted",
    type
  };
  store.complaints.unshift(complaint);
  return { complaint, ok: true };
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 210000, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$210000$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const [scheme, iterations, salt, expected] = String(stored ?? "").split("$");
  if (scheme !== "pbkdf2_sha256" || !iterations || !salt || !expected) {
    return false;
  }

  const actual = pbkdf2Sync(password, salt, Number(iterations), 32, "sha256");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function makeId(prefix) {
  return `${prefix}_${randomBytes(10).toString("hex")}`;
}

function timestamp() {
  return new Date().toISOString();
}

function failure(error) {
  return { error, ok: false };
}
