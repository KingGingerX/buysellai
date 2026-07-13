import test from "node:test";
import assert from "node:assert/strict";
import {
  addCartItem,
  adminDashboard,
  authenticateUser,
  blankStore,
  createCopyrightComplaint,
  createDmcaNotice,
  createListing,
  decideRefund,
  markOrderPaid,
  prepareCheckoutOrder,
  recordCheckoutSession,
  registerUser,
  requestRefund,
  searchListings
} from "../src/marketplace.mjs";

function listingInput(overrides = {}) {
  return {
    category: "agents",
    deliverables: "Installable workflow files, buyer guide, and configuration notes.",
    license: "commercial",
    price: "299",
    proof: "Runtime evidence includes successful execution logs and recovery notes.",
    supportWindow: "30 days",
    title: "Revenue Agent Workflow",
    ...overrides
  };
}

function register(store, overrides = {}) {
  const result = registerUser(store, {
    email: "seller@example.com",
    name: "Seller Operator",
    password: "long-password-123",
    role: "seller",
    ...overrides
  });
  assert.equal(result.ok, true);
  return result.user;
}

test("first registered account is administrator", () => {
  const store = blankStore();
  const user = register(store, { role: "buyer" });

  assert.equal(user.role, "admin");
});

test("seller listing binds price and identity to authenticated seller", () => {
  const store = blankStore();
  register(store, { email: "admin@example.com" });
  const seller = register(store);
  const result = createListing(store, listingInput(), seller);

  assert.equal(result.ok, true);
  assert.equal(result.listing.sellerId, seller.id);
  assert.equal(result.listing.price, 299);
});

test("public listing search hides price and seller identity", () => {
  const store = blankStore();
  register(store, { email: "admin@example.com" });
  const seller = register(store);
  createListing(store, listingInput(), seller);

  const [listing] = searchListings(store, { category: "all", license: "all", search: "revenue" }, null);

  assert.equal(listing.price, null);
  assert.equal(listing.seller, null);
  assert.equal(listing.priceLocked, true);
  assert.equal(listing.sellerLocked, true);
});

test("authenticated buyer can see price and add active listing to cart", () => {
  const store = blankStore();
  register(store, { email: "admin@example.com" });
  const seller = register(store);
  const buyer = register(store, { email: "buyer@example.com", role: "buyer" });
  const listing = createListing(store, listingInput(), seller).listing;

  const [visible] = searchListings(store, { category: "all", license: "all", search: "" }, buyer);
  const cart = addCartItem(store, buyer, listing.id);

  assert.equal(visible.price, 299);
  assert.equal(visible.seller.name, seller.name);
  assert.equal(cart.ok, true);
  assert.equal(cart.cart.total, 299);
});

test("password authentication rejects invalid credentials", () => {
  const store = blankStore();
  register(store, { email: "buyer@example.com", role: "buyer" });

  assert.equal(authenticateUser(store, { email: "buyer@example.com", password: "wrong" }).ok, false);
});

test("DMCA notices require sworn confirmations", () => {
  const store = blankStore();
  const result = createDmcaNotice(store, {
    accuracy: false,
    claimantEmail: "owner@example.com",
    claimantName: "Owner",
    goodFaith: true,
    infringingMaterial: "The listing redistributes protected files without authorization.",
    listingReference: "listing_123",
    workDescription: "The copyrighted work is a commercial automation package."
  });

  assert.equal(result.ok, false);
});

test("copyright complaints enter admin review", () => {
  const store = blankStore();
  const complaint = createCopyrightComplaint(store, {
    details: "The listing copies protected source documentation and branded deliverables.",
    listingReference: "listing_123",
    reporterEmail: "reporter@example.com",
    reporterName: "Reporter"
  });
  const dashboard = adminDashboard(store);

  assert.equal(complaint.ok, true);
  assert.equal(dashboard.complaints.length, 1);
  assert.equal(dashboard.complaints[0].status, "submitted");
});

test("checkout requires a single seller with payout onboarding", () => {
  const store = blankStore();
  register(store, { email: "admin@example.com" });
  const seller = register(store);
  const buyer = register(store, { email: "buyer@example.com", role: "buyer" });
  const listing = createListing(store, listingInput(), seller).listing;
  addCartItem(store, buyer, listing.id);

  assert.equal(prepareCheckoutOrder(store, buyer).ok, false);

  seller.stripeAccountId = "acct_real";
  seller.stripeConnectStatus = "onboarding_started";
  const prepared = prepareCheckoutOrder(store, buyer);

  assert.equal(prepared.ok, true);
  assert.equal(prepared.order.sellerId, seller.id);
  assert.equal(prepared.order.platformFee, 30);
});

test("paid checkout releases fulfillment and records seller payout ledger", () => {
  const store = blankStore();
  register(store, { email: "admin@example.com" });
  const seller = register(store);
  seller.stripeAccountId = "acct_real";
  seller.stripeConnectStatus = "onboarding_started";
  const buyer = register(store, { email: "buyer@example.com", role: "buyer" });
  const listing = createListing(store, listingInput(), seller).listing;
  addCartItem(store, buyer, listing.id);
  const prepared = prepareCheckoutOrder(store, buyer);
  const order = recordCheckoutSession(store, prepared.order, {
    id: "cs_real",
    url: "https://checkout.stripe.com/session"
  });

  const result = markOrderPaid(store, { id: "cs_real", payment_intent: "pi_real" });

  assert.equal(result.ok, true);
  assert.equal(order.fulfillmentStatus, "available");
  assert.equal(store.payoutLedger[0].sellerId, seller.id);
  assert.equal(store.payoutLedger[0].amount, 269);
});

test("refund request is seller liability and only seller of record can decide it", () => {
  const store = blankStore();
  register(store, { email: "admin@example.com" });
  const seller = register(store);
  seller.stripeAccountId = "acct_real";
  seller.stripeConnectStatus = "onboarding_started";
  const otherSeller = register(store, { email: "other@example.com", role: "seller" });
  const buyer = register(store, { email: "buyer@example.com", role: "buyer" });
  const listing = createListing(store, listingInput(), seller).listing;
  addCartItem(store, buyer, listing.id);
  const prepared = prepareCheckoutOrder(store, buyer);
  recordCheckoutSession(store, prepared.order, { id: "cs_real", url: "https://checkout.stripe.com/session" });
  markOrderPaid(store, { id: "cs_real", payment_intent: "pi_real" });

  const request = requestRefund(store, buyer, {
    orderId: prepared.order.id,
    reason: "The delivered package did not match the listed deliverables."
  });

  assert.equal(request.ok, true);
  assert.equal(request.refundRequest.liability, "seller");
  assert.equal(decideRefund(store, otherSeller, {
    decision: "approve",
    note: "Approving this request.",
    refundRequestId: request.refundRequest.id
  }).ok, false);
  assert.equal(decideRefund(store, seller, {
    decision: "reject",
    note: "Rejected because fulfillment matched the order record.",
    refundRequestId: request.refundRequest.id
  }).ok, true);
});
