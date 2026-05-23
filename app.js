const STORAGE_KEY = "income-desk-data-v1";

const state = {
  goal: 0,
  entries: [],
};

const FIREBASE_VERSION = "10.12.5";

let firebaseApi = null;
let currentUser = null;
let syncTimer = null;
let isLoadingCloud = false;

const categoriesByKind = {
  income: ["Salary", "Freelance", "Business", "Interest", "Other"],
  expense: ["Food", "Transport", "Rent", "Shopping", "Bills", "Health", "Gift", "Other"],
  asset: ["Cash", "Gold"],
};

const els = {
  exportCsv: document.querySelector("#exportCsv"),
  syncNow: document.querySelector("#syncNow"),
  syncStatus: document.querySelector("#syncStatus"),
  authForm: document.querySelector("#authForm"),
  email: document.querySelector("#email"),
  password: document.querySelector("#password"),
  signIn: document.querySelector("#signIn"),
  signUp: document.querySelector("#signUp"),
  signOut: document.querySelector("#signOut"),
  balanceTotal: document.querySelector("#balanceTotal"),
  monthDelta: document.querySelector("#monthDelta"),
  incomeTotal: document.querySelector("#incomeTotal"),
  expenseTotal: document.querySelector("#expenseTotal"),
  savingRate: document.querySelector("#savingRate"),
  savingNote: document.querySelector("#savingNote"),
  assetTotal: document.querySelector("#assetTotal"),
  assetNote: document.querySelector("#assetNote"),
  form: document.querySelector("#transactionForm"),
  clearForm: document.querySelector("#clearForm"),
  kindInputs: document.querySelectorAll('input[name="kind"]'),
  amount: document.querySelector("#amount"),
  source: document.querySelector("#source"),
  sourceLabel: document.querySelector("#sourceLabel"),
  date: document.querySelector("#date"),
  categoryLabel: document.querySelector("#categoryLabel"),
  category: document.querySelector("#category"),
  note: document.querySelector("#note"),
  submitButton: document.querySelector("#submitButton"),
  goalAmount: document.querySelector("#goalAmount"),
  goalPercent: document.querySelector("#goalPercent"),
  goalRingText: document.querySelector("#goalRingText"),
  goalBar: document.querySelector("#goalBar"),
  goalStatus: document.querySelector("#goalStatus"),
  sourceCount: document.querySelector("#sourceCount"),
  sourceChart: document.querySelector("#sourceChart"),
  assetCount: document.querySelector("#assetCount"),
  assetChart: document.querySelector("#assetChart"),
  incomeList: document.querySelector("#incomeList"),
  resetData: document.querySelector("#resetData"),
  template: document.querySelector("#incomeItemTemplate"),
};

function getToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthKey(dateString) {
  return dateString.slice(0, 7);
}

function formatMoney(value) {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  return `₹${rounded.toLocaleString("en-IN", {
    minimumFractionDigits: rounded % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${dateString}T00:00:00`));
}

function currentKind() {
  return document.querySelector('input[name="kind"]:checked').value;
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  scheduleCloudSync();
}

function normalizeEntry(entry) {
  const kind = ["income", "expense", "asset"].includes(entry.kind) ? entry.kind : "income";
  const category = entry.category || entry.investmentType || entry.type || (kind === "asset" ? "Cash" : "Other");

  return {
    id: entry.id || crypto.randomUUID(),
    kind,
    assetClass: kind === "asset" ? entry.assetClass || "investment" : "",
    investmentType: kind === "asset" ? entry.investmentType || category : "",
    amount: Number(entry.amount) || 0,
    source: entry.source || "Unknown",
    date: entry.date || getToday(),
    category,
    note: entry.note || "",
  };
}

function load() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      state.goal = Number(parsed.goal) || 0;
      state.entries = Array.isArray(parsed.entries) ? parsed.entries.map(normalizeEntry) : [];
      return;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  state.goal = 70000;
  save();
}

function getCurrentMonthEntries() {
  const month = getMonthKey(getToday());
  return state.entries.filter((entry) => getMonthKey(entry.date) === month);
}

function sum(entries) {
  return entries.reduce((total, entry) => total + Number(entry.amount || 0), 0);
}

function entriesByKind(entries, kind) {
  return entries.filter((entry) => entry.kind === kind);
}

function groupByCategory(entries) {
  return entries.reduce((groups, entry) => {
    const category = entry.category || "Other";
    groups[category] = (groups[category] || 0) + Number(entry.amount || 0);
    return groups;
  }, {});
}

function renderSummary() {
  const monthEntries = getCurrentMonthEntries();
  const income = sum(entriesByKind(monthEntries, "income"));
  const expenses = sum(entriesByKind(monthEntries, "expense"));
  const assets = sum(entriesByKind(state.entries, "asset"));
  const balance = income - expenses;
  const savingsPercent = income ? Math.round((balance / income) * 100) : 0;
  const assetEntries = entriesByKind(state.entries, "asset");
  const assetTypes = Object.keys(groupByCategory(assetEntries));

  els.balanceTotal.textContent = formatMoney(balance);
  els.monthDelta.textContent = `${monthEntries.length} ${monthEntries.length === 1 ? "transaction" : "transactions"} this month`;
  els.incomeTotal.textContent = formatMoney(income);
  els.expenseTotal.textContent = formatMoney(expenses);
  els.savingRate.textContent = `${Math.max(0, savingsPercent)}%`;
  els.savingNote.textContent = balance >= 0 ? "Income kept" : "Overspent";
  els.assetTotal.textContent = formatMoney(assets);
  els.assetNote.textContent = assetTypes.length ? `Invested in ${assetTypes.join(" + ")}` : "Cash + Gold investments";
}

function renderGoal() {
  const monthEntries = getCurrentMonthEntries();
  const income = sum(entriesByKind(monthEntries, "income"));
  const expenses = sum(entriesByKind(monthEntries, "expense"));
  const saved = income - expenses;
  const target = Number(state.goal) || 0;
  const rawPercent = target ? (saved / target) * 100 : 0;
  const percent = Math.max(0, Math.min(999, Math.round(rawPercent)));
  const barPercent = Math.max(0, Math.min(100, rawPercent));
  const ringDegrees = Math.max(0, Math.min(360, rawPercent * 3.6));

  els.goalAmount.value = target || "";
  els.goalPercent.textContent = `${percent}%`;
  els.goalRingText.textContent = `${percent}%`;
  els.goalBar.style.width = `${barPercent}%`;
  document.querySelector(".goal-ring").style.setProperty("--goal", `${ringDegrees}deg`);

  if (!target) {
    els.goalStatus.textContent = "Set a monthly savings target.";
  } else if (saved >= target) {
    els.goalStatus.textContent = `${formatMoney(saved - target)} above savings target.`;
  } else {
    els.goalStatus.textContent = `${formatMoney(target - saved)} left to save.`;
  }
}

function renderSources() {
  const expenseEntries = entriesByKind(getCurrentMonthEntries(), "expense");
  const grouped = Object.entries(groupByCategory(expenseEntries)).sort((a, b) => b[1] - a[1]);
  const max = grouped[0]?.[1] || 0;

  els.sourceCount.textContent = String(grouped.length);
  els.sourceChart.innerHTML = "";

  if (!grouped.length) {
    els.sourceChart.innerHTML = '<div class="empty-state">No expenses yet.</div>';
    return;
  }

  grouped.forEach(([category, amount]) => {
    const row = document.createElement("article");
    row.className = "source-row";
    row.innerHTML = `
      <header>
        <span></span>
        <strong></strong>
      </header>
      <div class="source-track"><div class="source-fill"></div></div>
    `;
    row.querySelector("span").textContent = category;
    row.querySelector("strong").textContent = formatMoney(amount);
    row.querySelector(".source-fill").style.width = `${Math.max(4, (amount / max) * 100)}%`;
    els.sourceChart.append(row);
  });
}

function renderAssets() {
  const assetEntries = entriesByKind(state.entries, "asset");
  const grouped = Object.entries(groupByCategory(assetEntries)).sort((a, b) => b[1] - a[1]);
  const max = grouped[0]?.[1] || 0;

  els.assetCount.textContent = String(grouped.length);
  els.assetChart.innerHTML = "";

  if (!grouped.length) {
    els.assetChart.innerHTML = '<div class="empty-state">No assets yet. Add Cash or Gold.</div>';
    return;
  }

  grouped.forEach(([category, amount]) => {
    const row = document.createElement("article");
    row.className = "source-row asset-row";
    row.innerHTML = `
      <header>
        <span></span>
        <strong></strong>
      </header>
      <div class="source-track"><div class="source-fill"></div></div>
    `;
    row.querySelector("span").textContent = category;
    row.querySelector("strong").textContent = formatMoney(amount);
    row.querySelector(".source-fill").style.width = `${Math.max(4, (amount / max) * 100)}%`;
    els.assetChart.append(row);
  });
}

function renderList() {
  const sorted = [...state.entries].sort((a, b) => b.date.localeCompare(a.date));
  els.incomeList.innerHTML = "";

  if (!sorted.length) {
    els.incomeList.innerHTML = '<div class="empty-state">No transactions added.</div>';
    return;
  }

  sorted.forEach((entry) => {
    const item = els.template.content.firstElementChild.cloneNode(true);
    item.classList.toggle("expense-item", entry.kind === "expense");
    item.classList.toggle("asset-item", entry.kind === "asset");
    item.querySelector(".item-source").textContent = entry.source;
    item.querySelector(".item-meta").textContent = `${formatDate(entry.date)} · ${entry.kind} · ${entry.category}`;
    item.querySelector(".item-note").textContent = entry.note || "";
    item.querySelector(".item-amount").textContent = `${entry.kind === "expense" ? "-" : "+"}${formatMoney(entry.amount)}`;
    item.querySelector(".delete-income").dataset.id = entry.id;
    els.incomeList.append(item);
  });
}

function setCategoryOptions(kind) {
  const options = categoriesByKind[kind] || categoriesByKind.income;
  els.category.replaceChildren(
    ...options.map((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      return option;
    }),
  );
}

function renderFormMode() {
  const kind = currentKind();
  const isExpense = kind === "expense";
  const isAsset = kind === "asset";

  setCategoryOptions(kind);
  els.sourceLabel.textContent = isAsset ? "Asset name" : isExpense ? "Spent at" : "Source";
  els.categoryLabel.textContent = isAsset ? "Investment type" : "Category";
  els.source.placeholder = isAsset ? "Bank FD, jewellery, locker gold" : isExpense ? "Rent, groceries, petrol" : "Salary, client, rent";
  els.category.value = isAsset ? "Cash" : isExpense ? "Food" : "Salary";
  els.submitButton.classList.toggle("expense-button", isExpense);
  els.submitButton.classList.toggle("asset-button", isAsset);
  els.submitButton.lastChild.textContent = isAsset ? " Add asset" : isExpense ? " Add expense" : " Add income";
}

function render() {
  renderSummary();
  renderGoal();
  renderSources();
  renderAssets();
  renderList();
}

function hasFirebaseConfig() {
  const config = window.MONEY_DESK_CONFIG?.firebaseConfig;
  return Boolean(config?.apiKey && config?.authDomain && config?.projectId && config?.appId);
}

function setSyncStatus(message) {
  els.syncStatus.textContent = message;
}

function updateAuthUi() {
  const hasConfig = hasFirebaseConfig();
  const signedIn = Boolean(currentUser);

  els.email.disabled = !hasConfig || signedIn;
  els.password.disabled = !hasConfig || signedIn;
  els.signIn.disabled = !hasConfig || signedIn;
  els.signUp.disabled = !hasConfig || signedIn;
  els.syncNow.disabled = !hasConfig || !signedIn;
  els.signOut.hidden = !signedIn;

  if (!hasConfig) {
    setSyncStatus("Local mode. Add Firebase settings to config.js to enable login and sync.");
  } else if (signedIn) {
    setSyncStatus(`Synced account: ${currentUser.email}`);
  } else {
    setSyncStatus("Firebase ready. Sign in to sync across devices.");
  }
}

function toCloudEntry(entry) {
  return {
    kind: entry.kind,
    assetClass: entry.kind === "asset" ? "investment" : "",
    investmentType: entry.kind === "asset" ? entry.investmentType || entry.category : "",
    amount: Number(entry.amount) || 0,
    source: entry.source,
    category: entry.category,
    note: entry.note || "",
    date: entry.date,
  };
}

function fromCloudEntry(documentSnapshot) {
  const data = documentSnapshot.data();
  return normalizeEntry({
    id: documentSnapshot.id,
    kind: data.kind,
    assetClass: data.assetClass,
    investmentType: data.investmentType,
    amount: data.amount,
    source: data.source,
    date: data.date,
    category: data.category,
    note: data.note,
  });
}

function scheduleCloudSync() {
  if (isLoadingCloud || !firebaseApi || !currentUser) {
    return;
  }

  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncToCloud();
  }, 600);
}

async function syncToCloud() {
  if (!firebaseApi || !currentUser) {
    return;
  }

  const { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } = firebaseApi.firestore;
  const userId = currentUser.uid;
  const transactionsRef = collection(firebaseApi.db, "users", userId, "transactions");
  const cloudDocs = await getDocs(transactionsRef);
  const localIds = new Set(state.entries.map((entry) => entry.id));

  await setDoc(
    doc(firebaseApi.db, "users", userId, "settings", "profile"),
    {
      currency: "INR",
      goal: Number(state.goal) || 0,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  await Promise.all(
    state.entries.map((entry) => setDoc(doc(transactionsRef, entry.id), toCloudEntry(entry), { merge: true })),
  );

  await Promise.all(
    cloudDocs.docs.filter((cloudDoc) => !localIds.has(cloudDoc.id)).map((cloudDoc) => deleteDoc(cloudDoc.ref)),
  );

  setSyncStatus(`Synced ${state.entries.length} transactions for ${currentUser.email}.`);
}

async function loadFromCloud() {
  if (!firebaseApi || !currentUser) {
    return;
  }

  const { collection, doc, getDoc, getDocs } = firebaseApi.firestore;
  const userId = currentUser.uid;

  isLoadingCloud = true;
  setSyncStatus("Loading cloud data...");

  try {
    const [settingsDoc, transactionDocs] = await Promise.all([
      getDoc(doc(firebaseApi.db, "users", userId, "settings", "profile")),
      getDocs(collection(firebaseApi.db, "users", userId, "transactions")),
    ]);

    if (settingsDoc.exists()) {
      const settings = settingsDoc.data();
      state.goal = Number(settings.goal) || 0;
    }

    if (!transactionDocs.empty) {
      state.entries = transactionDocs.docs.map(fromCloudEntry);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render();
      setSyncStatus(`Loaded ${state.entries.length} cloud transactions for ${currentUser.email}.`);
    } else {
      await syncToCloud();
    }
  } catch (error) {
    setSyncStatus(error.message || "Could not load cloud data.");
  } finally {
    isLoadingCloud = false;
    updateAuthUi();
  }
}

async function initFirebase() {
  if (!hasFirebaseConfig()) {
    updateAuthUi();
    return;
  }

  try {
    const [{ initializeApp }, authModule, firestoreModule] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`),
    ]);

    const app = initializeApp(window.MONEY_DESK_CONFIG.firebaseConfig);
    const auth = authModule.getAuth(app);
    const db = firestoreModule.getFirestore(app);

    firebaseApi = {
      auth,
      db,
      authModule,
      firestore: firestoreModule,
    };

    authModule.onAuthStateChanged(auth, async (user) => {
      currentUser = user;
      updateAuthUi();
      if (user) {
        await loadFromCloud();
      }
    });
  } catch (error) {
    setSyncStatus(error.message || "Firebase could not start.");
  }
}

async function signIn() {
  if (!firebaseApi) {
    return;
  }

  try {
    setSyncStatus("Signing in...");
    await firebaseApi.authModule.signInWithEmailAndPassword(firebaseApi.auth, els.email.value.trim(), els.password.value);
  } catch (error) {
    setSyncStatus(getAuthErrorMessage(error, "Sign in failed."));
  }
}

async function signUp() {
  if (!firebaseApi) {
    return;
  }

  try {
    setSyncStatus("Creating account...");
    await firebaseApi.authModule.createUserWithEmailAndPassword(firebaseApi.auth, els.email.value.trim(), els.password.value);
  } catch (error) {
    setSyncStatus(getAuthErrorMessage(error, "Account creation failed."));
  }
}

async function signOut() {
  if (!firebaseApi) {
    return;
  }

  await firebaseApi.authModule.signOut(firebaseApi.auth);
  currentUser = null;
  updateAuthUi();
}

function resetForm() {
  els.form.reset();
  els.date.value = getToday();
  renderFormMode();
  els.amount.focus();
}

function addTransaction(event) {
  event.preventDefault();
  const amount = Number(els.amount.value);

  if (!amount || amount <= 0) {
    els.amount.focus();
    return;
  }

  state.entries.push({
    id: crypto.randomUUID(),
    kind: currentKind(),
    assetClass: currentKind() === "asset" ? "investment" : "",
    investmentType: currentKind() === "asset" ? els.category.value : "",
    amount,
    source: els.source.value.trim(),
    date: els.date.value,
    category: els.category.value,
    note: els.note.value.trim(),
  });

  save();
  resetForm();
  render();
}

function deleteTransaction(id) {
  const entry = state.entries.find((item) => item.id === id);

  if (!entry) {
    return;
  }

  const label = entry.kind === "asset" ? "asset" : entry.kind === "expense" ? "expense" : "income";
  const confirmed = confirm(`Remove this ${label}?\n\n${entry.source} - ${formatMoney(entry.amount)}`);

  if (!confirmed) {
    return;
  }

  state.entries = state.entries.filter((entry) => entry.id !== id);
  save();
  render();
}

function exportCsv() {
  const rows = [
    ["Date", "Kind", "Asset Class", "Investment Type", "Name", "Category", "Amount", "Note"],
    ...state.entries.map((entry) => [
      entry.date,
      entry.kind,
      entry.assetClass || "",
      entry.investmentType || "",
      entry.source,
      entry.category,
      entry.amount,
      entry.note,
    ]),
  ];
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `money-desk-${getToday()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function getAuthErrorMessage(error, fallback) {
  const code = error?.code || "";

  if (code.includes("auth/invalid-email")) {
    return "Enter a valid email address.";
  }

  if (code.includes("auth/missing-password")) {
    return "Enter your password.";
  }

  if (code.includes("auth/weak-password")) {
    return "Use at least 6 characters for the password.";
  }

  if (code.includes("auth/invalid-credential") || code.includes("auth/wrong-password") || code.includes("auth/user-not-found")) {
    return "Email or password is incorrect.";
  }

  if (code.includes("auth/email-already-in-use")) {
    return "This email already has an account. Use Sign in.";
  }

  if (code.includes("auth/unauthorized-domain")) {
    return "This website domain is not allowed in Firebase Authentication yet.";
  }

  if (code.includes("auth/network-request-failed")) {
    return "Network error. Check your connection and try again.";
  }

  return error?.message || fallback;
}

els.form.addEventListener("submit", addTransaction);
els.authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  signIn();
});
els.clearForm.addEventListener("click", resetForm);
els.kindInputs.forEach((input) => input.addEventListener("change", renderFormMode));
els.signIn.addEventListener("click", signIn);
els.signUp.addEventListener("click", signUp);
els.signOut.addEventListener("click", signOut);
els.syncNow.addEventListener("click", syncToCloud);
els.goalAmount.addEventListener("input", (event) => {
  state.goal = Number(event.target.value) || 0;
  save();
  renderGoal();
});
els.incomeList.addEventListener("click", (event) => {
  const button = event.target.closest(".delete-income");
  if (button) {
    deleteTransaction(button.dataset.id);
  }
});
els.resetData.addEventListener("click", () => {
  if (state.entries.length && confirm("Delete all transactions?")) {
    state.entries = [];
    save();
    render();
  }
});
els.exportCsv.addEventListener("click", exportCsv);

load();
els.date.value = getToday();
renderFormMode();
render();
initFirebase();
