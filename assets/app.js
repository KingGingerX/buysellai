let bootstrap = {
  categories: [],
  legalPages: [],
  licenses: [],
  user: null
};

const elements = {
  adminPanel: document.querySelector("#admin-panel"),
  buyerPanel: document.querySelector("#buyer-panel"),
  category: document.querySelector("#category"),
  categoryStrip: document.querySelector("#category-strip"),
  copyrightForm: document.querySelector("#copyright-form"),
  copyrightStatus: document.querySelector("#copyright-status"),
  dmcaForm: document.querySelector("#dmca-form"),
  dmcaStatus: document.querySelector("#dmca-status"),
  filters: document.querySelector("#filters"),
  legalPages: document.querySelector("#legal-pages"),
  license: document.querySelector("#license"),
  listingGrid: document.querySelector("#listing-grid"),
  loginForm: document.querySelector("#login-form"),
  loginStatus: document.querySelector("#login-status"),
  logoutButton: document.querySelector("#logout-button"),
  registerForm: document.querySelector("#register-form"),
  registerStatus: document.querySelector("#register-status"),
  search: document.querySelector("#search"),
  sellerForm: document.querySelector("#seller-form"),
  sellerPanel: document.querySelector("#seller-panel"),
  sellerStatus: document.querySelector("#seller-status"),
  sessionLabel: document.querySelector("#session-label"),
  stripeButton: document.querySelector("#stripe-connect-button")
};

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function option(value, label) {
  const item = document.createElement("option");
  item.value = value;
  item.textContent = label;
  return item;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    },
    ...options
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed.");
  }

  return payload;
}

function formPayload(form) {
  const payload = Object.fromEntries(new FormData(form).entries());
  for (const checkbox of form.querySelectorAll("input[type='checkbox']")) {
    payload[checkbox.name] = checkbox.checked;
  }
  return payload;
}

function setStatus(element, message, isError = false) {
  element.className = isError ? "form-status error" : "form-status";
  element.textContent = message;
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency"
  }).format(value);
}

function hydrateSelects() {
  for (const select of [elements.category, elements.sellerForm.elements.category]) {
    select.replaceChildren();
  }
  for (const select of [elements.license, elements.sellerForm.elements.license]) {
    select.replaceChildren();
  }

  elements.category.append(option("all", "All categories"));
  elements.license.append(option("all", "All licenses"));

  for (const category of bootstrap.categories) {
    elements.category.append(option(category.id, category.name));
    elements.sellerForm.elements.category.append(option(category.id, category.name));
  }

  for (const license of bootstrap.licenses) {
    elements.license.append(option(license.id, license.name));
    elements.sellerForm.elements.license.append(option(license.id, license.name));
  }
}

function renderSession() {
  if (!bootstrap.user) {
    elements.sessionLabel.textContent = "Signed out";
    elements.logoutButton.classList.add("hidden");
    return;
  }

  elements.sessionLabel.textContent = `${bootstrap.user.name} - ${bootstrap.user.role}`;
  elements.logoutButton.classList.remove("hidden");
}

function renderCategories() {
  elements.categoryStrip.replaceChildren(
    ...bootstrap.categories.map((category) => {
      const pill = node("button", "category-pill");
      pill.type = "button";
      pill.append(node("strong", "", category.name), node("span", "", category.description));
      pill.addEventListener("click", () => {
        elements.category.value = category.id;
        renderListings();
      });
      return pill;
    })
  );
}

async function renderListings() {
  const params = new URLSearchParams({
    category: elements.category.value,
    license: elements.license.value,
    search: elements.search.value
  });
  const { listings } = await api(`/api/listings?${params}`);

  if (listings.length === 0) {
    const empty = node("div", "empty-state");
    empty.append(node("h3", "", "No active listings match this view"));
    empty.append(node("p", "", "Seller accounts can submit listings from the seller dashboard."));
    elements.listingGrid.replaceChildren(empty);
    return;
  }

  elements.listingGrid.replaceChildren(...listings.map(renderListingCard));
}

function renderListingCard(listing) {
  const category = bootstrap.categories.find((item) => item.id === listing.category);
  const license = bootstrap.licenses.find((item) => item.id === listing.license);
  const card = node("article", "listing-card");
  const topline = node("div", "listing-topline");
  topline.append(node("span", "badge", category?.name ?? "Reviewed asset"));
  topline.append(node("span", "price", listing.priceLocked ? "Login for price" : money(listing.price)));

  const body = node("div");
  body.append(node("h3", "", listing.title), node("p", "", listing.deliverables));

  const meta = node("ul", "meta-list");
  meta.append(
    node("li", "", `Seller: ${listing.sellerLocked ? "Login required" : listing.seller.name}`),
    node("li", "", `License: ${license?.name ?? listing.license}`),
    node("li", "", `Support: ${listing.supportWindow}`),
    node("li", "", `Proof: ${listing.proof}`)
  );

  const button = node("button", "button primary small", bootstrap.user ? "Add to cart" : "Sign in to buy");
  button.type = "button";
  button.disabled = !bootstrap.user;
  button.addEventListener("click", async () => {
    await api("/api/cart/add", {
      body: JSON.stringify({ listingId: listing.id }),
      method: "POST"
    });
    await renderBuyerDashboard();
  });

  card.append(topline, body, meta, button);
  return card;
}

function renderLegalPages() {
  elements.legalPages.replaceChildren(
    ...bootstrap.legalPages.map((page) => {
      const card = node("article");
      card.append(node("h3", "", page.title), node("p", "", page.body));
      return card;
    })
  );
}

async function renderBuyerDashboard() {
  if (!bootstrap.user || !["buyer", "admin"].includes(bootstrap.user.role)) {
    elements.buyerPanel.replaceChildren(accessMessage("Buyer login required."));
    return;
  }

  const dashboard = await api("/api/dashboard/buyer");
  const panel = node("div");
  panel.append(node("h3", "", "Cart"));

  if (dashboard.cart.items.length === 0) {
    panel.append(node("p", "", "Cart is empty."));
  } else {
    for (const item of dashboard.cart.items) {
      const row = node("div", "cart-row");
      const detail = node("div");
      detail.append(node("strong", "", item.title), node("span", "", `${item.seller.name} - ${money(item.price)}`));
      const remove = node("button", "button small", "Remove");
      remove.type = "button";
      remove.addEventListener("click", async () => {
        await api("/api/cart/remove", {
          body: JSON.stringify({ listingId: item.id }),
          method: "POST"
        });
        await renderBuyerDashboard();
      });
      row.append(detail, remove);
      panel.append(row);
    }
    const total = node("div", "cart-total");
    total.append(node("span", "", "Total"), node("span", "", money(dashboard.cart.total)));
    panel.append(total);
    const checkout = node("button", "button primary", "Checkout with Stripe");
    checkout.type = "button";
    checkout.addEventListener("click", async () => {
      try {
        const result = await api("/api/checkout", { method: "POST" });
        window.location.assign(result.checkoutUrl);
      } catch (error) {
        panel.append(node("p", "form-status error", error.message));
      }
    });
    panel.append(checkout);
  }

  panel.append(node("h3", "", "Orders"));
  if (dashboard.orders.length === 0) {
    panel.append(node("p", "", "No orders have been created."));
  } else {
    for (const order of dashboard.orders) {
      panel.append(renderBuyerOrder(order, dashboard.refundRequests));
    }
  }
  elements.buyerPanel.replaceChildren(panel);
}

function renderBuyerOrder(order, refundRequests) {
  const wrapper = node("div", "cart-row");
  const detail = node("div");
  detail.append(
    node("strong", "", `${order.id} - ${order.status}`),
    node("span", "", `${money(order.total)} - fulfillment ${order.fulfillmentStatus}`)
  );
  wrapper.append(detail);

  const existing = refundRequests.find((request) => request.orderId === order.id);
  if (existing) {
    wrapper.append(node("span", "badge", `Refund ${existing.status}`));
    return wrapper;
  }

  if (order.status === "paid") {
    const form = node("form", "inline-form");
    const reason = document.createElement("textarea");
    reason.name = "reason";
    reason.required = true;
    reason.minLength = 24;
    reason.maxLength = 1000;
    reason.setAttribute("aria-label", "Refund reason");
    const submit = node("button", "button small", "Request seller refund");
    submit.type = "submit";
    form.append(reason, submit);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      await api("/api/refunds/request", {
        body: JSON.stringify({ orderId: order.id, reason: reason.value }),
        method: "POST"
      });
      await renderBuyerDashboard();
    });
    wrapper.append(form);
  }

  return wrapper;
}

async function renderSellerDashboard() {
  if (!bootstrap.user || !["seller", "admin"].includes(bootstrap.user.role)) {
    elements.sellerPanel.replaceChildren(accessMessage("Seller login required."));
    return;
  }

  const dashboard = await api("/api/dashboard/seller");
  const panel = node("div");
  panel.append(node("h3", "", "Payouts"));
  panel.append(node("p", "", `Stripe Connect status: ${dashboard.payouts.stripeConnectStatus}`));
  panel.append(node("p", "", `${dashboard.payouts.ledger.length} payout ledger entries recorded.`));
  panel.append(node("h3", "", "Listings"));

  if (dashboard.listings.length === 0) {
    panel.append(node("p", "", "No seller listings yet."));
  } else {
    for (const listing of dashboard.listings) {
      const row = node("div", "cart-row");
      row.append(node("strong", "", listing.title), node("span", "", `${money(listing.price)} - ${listing.status}`));
      panel.append(row);
    }
  }

  panel.append(node("h3", "", "Refund responsibility"));
  if (dashboard.refundRequests.length === 0) {
    panel.append(node("p", "", "No seller refund requests are open."));
  } else {
    for (const request of dashboard.refundRequests) {
      panel.append(renderSellerRefundRequest(request));
    }
  }

  elements.sellerPanel.replaceChildren(panel);
}

function renderSellerRefundRequest(request) {
  const wrapper = node("div", "cart-row");
  const detail = node("div");
  detail.append(
    node("strong", "", `${request.id} - ${request.status}`),
    node("span", "", `${money(request.amount)} - liability ${request.liability}`)
  );
  wrapper.append(detail);

  if (request.status !== "requested") {
    return wrapper;
  }

  const form = node("form", "inline-form");
  const note = document.createElement("textarea");
  note.name = "note";
  note.required = true;
  note.minLength = 12;
  note.maxLength = 1000;
  note.setAttribute("aria-label", "Seller refund decision note");
  const approve = node("button", "button small", "Approve");
  approve.type = "submit";
  approve.value = "approve";
  const reject = node("button", "button small", "Reject");
  reject.type = "submit";
  reject.value = "reject";
  form.append(note, approve, reject);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitter = event.submitter;
    await api("/api/refunds/decide", {
      body: JSON.stringify({
        decision: submitter.value,
        note: note.value,
        refundRequestId: request.id
      }),
      method: "POST"
    });
    await renderSellerDashboard();
  });
  wrapper.append(form);
  return wrapper;
}

async function renderAdminDashboard() {
  if (!bootstrap.user || bootstrap.user.role !== "admin") {
    elements.adminPanel.replaceChildren(accessMessage("Admin login required."));
    return;
  }

  const dashboard = await api("/api/dashboard/admin");
  const panel = node("div");
  panel.append(
    node("h3", "", "Operating totals"),
    node(
      "p",
      "",
      `${dashboard.users.length} users - ${dashboard.listings.length} listings - ${dashboard.complaints.length} complaints - ${dashboard.refundRequests.length} refunds`
    )
  );
  panel.append(node("h3", "", "Complaints"));

  if (dashboard.complaints.length === 0) {
    panel.append(node("p", "", "No complaints submitted."));
  } else {
    for (const complaint of dashboard.complaints) {
      const row = node("div", "cart-row");
      row.append(node("strong", "", `${complaint.type} - ${complaint.status}`), node("span", "", complaint.createdAt));
      panel.append(row);
    }
  }

  elements.adminPanel.replaceChildren(panel);
}

function accessMessage(message) {
  const wrapper = node("div");
  wrapper.append(node("h3", "", message), node("p", "", "Use the account panel to sign in with the required role."));
  return wrapper;
}

async function refreshAll() {
  bootstrap = await api("/api/bootstrap");
  hydrateSelects();
  renderSession();
  renderCategories();
  renderLegalPages();
  await renderListings();
  await Promise.all([renderBuyerDashboard(), renderSellerDashboard(), renderAdminDashboard()]);
}

async function handleAuthForm(form, statusElement, endpoint) {
  setStatus(statusElement, "");
  if (!form.reportValidity()) {
    setStatus(statusElement, "Complete the required fields.", true);
    return;
  }

  try {
    const result = await api(endpoint, {
      body: JSON.stringify(formPayload(form)),
      method: "POST"
    });
    bootstrap.user = result.user;
    form.reset();
    setStatus(statusElement, "Account session is active.");
    await refreshAll();
  } catch (error) {
    setStatus(statusElement, error.message, true);
  }
}

elements.registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await handleAuthForm(elements.registerForm, elements.registerStatus, "/api/auth/register");
});

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await handleAuthForm(elements.loginForm, elements.loginStatus, "/api/auth/login");
});

elements.logoutButton.addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" });
  await refreshAll();
});

elements.filters.addEventListener("input", () => {
  renderListings().catch((error) => setStatus(elements.sellerStatus, error.message, true));
});

elements.sellerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus(elements.sellerStatus, "");
  if (!elements.sellerForm.reportValidity()) {
    setStatus(elements.sellerStatus, "Complete every required seller field before submitting.", true);
    return;
  }

  try {
    await api("/api/listings", {
      body: JSON.stringify(formPayload(elements.sellerForm)),
      method: "POST"
    });
    elements.sellerForm.reset();
    setStatus(elements.sellerStatus, "Listing submitted and published under the authenticated seller identity.");
    await refreshAll();
  } catch (error) {
    setStatus(elements.sellerStatus, error.message, true);
  }
});

elements.stripeButton.addEventListener("click", async () => {
  try {
    const result = await api("/api/stripe/connect", { method: "POST" });
    window.location.assign(result.onboardingUrl);
  } catch (error) {
    setStatus(elements.sellerStatus, error.message, true);
    await renderSellerDashboard();
  }
});

elements.dmcaForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/dmca", {
      body: JSON.stringify(formPayload(elements.dmcaForm)),
      method: "POST"
    });
    elements.dmcaForm.reset();
    setStatus(elements.dmcaStatus, "DMCA notice submitted for admin review.");
    await renderAdminDashboard();
  } catch (error) {
    setStatus(elements.dmcaStatus, error.message, true);
  }
});

elements.copyrightForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/copyright-complaints", {
      body: JSON.stringify(formPayload(elements.copyrightForm)),
      method: "POST"
    });
    elements.copyrightForm.reset();
    setStatus(elements.copyrightStatus, "Copyright complaint submitted for admin review.");
    await renderAdminDashboard();
  } catch (error) {
    setStatus(elements.copyrightStatus, error.message, true);
  }
});

refreshAll().catch((error) => {
  elements.listingGrid.replaceChildren(node("div", "empty-state", error.message));
});
