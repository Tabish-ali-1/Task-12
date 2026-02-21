const CURRENCY_LIST_URL = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies.min.json";
const CURRENCY_RATES_BASE_URL = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies";
const STORAGE_KEY = "currency_converter_preferences_v1";
const HISTORY_KEY = "currency_converter_history_v1";
const MAX_HISTORY_ITEMS = 8;
const MIN_CURRENCY_OPTIONS = 200;

const form = document.getElementById("converter-form");
const amountInput = document.getElementById("amount");
const fromCurrencySelect = document.getElementById("from-currency");
const toCurrencySelect = document.getElementById("to-currency");
const fromSearchInput = document.getElementById("from-search");
const toSearchInput = document.getElementById("to-search");
const fromSearchResults = document.getElementById("from-search-results");
const toSearchResults = document.getElementById("to-search-results");
const swapButton = document.getElementById("swap-btn");
const resultContainer = document.getElementById("result");
const statusContainer = document.getElementById("status");
const historyList = document.getElementById("history-list");

let currencyMap = {};
let allCurrencies = [];

function setStatus(message, type = "") {
  statusContainer.textContent = message;
  statusContainer.className = `status${type ? ` ${type}` : ""}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 6
  }).format(value);
}

function renderHistory() {
  const history = getHistory();
  historyList.innerHTML = "";

  if (!history.length) {
    const li = document.createElement("li");
    li.className = "empty-history";
    li.textContent = "No conversions yet.";
    historyList.appendChild(li);
    return;
  }

  history.forEach((item) => {
    const li = document.createElement("li");
    li.textContent =
      `${item.amount} ${item.from} → ${item.converted} ${item.to} ` +
      `(${new Date(item.at).toLocaleString()})`;
    historyList.appendChild(li);
  });
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function saveToHistory(entry) {
  const history = getHistory();
  const updated = [entry, ...history].slice(0, MAX_HISTORY_ITEMS);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  renderHistory();
}

function savePreferences() {
  const data = {
    from: fromCurrencySelect.value,
    to: toCurrencySelect.value
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function readPreferences() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function populateCurrencySelect(selectElement, selectedCode, query = "") {
  selectElement.innerHTML = "";
  const searchQuery = query.trim().toLowerCase();
  const matches = allCurrencies.filter(([code, name]) => {
    if (!searchQuery) {
      return true;
    }
    return code.toLowerCase().includes(searchQuery) || name.toLowerCase().includes(searchQuery);
  });

  const selectedEntry = allCurrencies.find(([code]) => code === selectedCode);
  const selectedMissingFromResults = selectedEntry && !matches.some(([code]) => code === selectedCode);
  const entriesToRender = selectedMissingFromResults ? [selectedEntry, ...matches] : matches;

  if (!entriesToRender.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No matching currencies";
    option.disabled = true;
    option.selected = true;
    selectElement.appendChild(option);
    return;
  }

  entriesToRender.forEach(([code, name]) => {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = `${code} - ${name}`;
    if (code === selectedCode) {
      option.selected = true;
    }
    selectElement.appendChild(option);
  });
}

async function fetchCurrencies() {
  const response = await fetch(CURRENCY_LIST_URL);
  if (!response.ok) {
    throw new Error("Could not load currencies.");
  }

  const data = await response.json();
  currencyMap = Object.fromEntries(
    Object.entries(data).map(([code, name]) => [code.toUpperCase(), name])
  );
  allCurrencies = Object.entries(currencyMap).sort((a, b) => a[0].localeCompare(b[0]));

  if (allCurrencies.length < MIN_CURRENCY_OPTIONS) {
    throw new Error("Not enough currency options loaded.");
  }
}

function hideSearchResults(container) {
  container.hidden = true;
  container.innerHTML = "";
}

function getFilteredCurrencies(query) {
  const searchQuery = query.trim().toLowerCase();
  if (!searchQuery) {
    return [];
  }
  return allCurrencies
    .filter(([code, name]) => {
      return code.toLowerCase().includes(searchQuery) || name.toLowerCase().includes(searchQuery);
    })
    .slice(0, 20);
}

function renderSearchResults(searchInput, resultsContainer, selectElement) {
  const matches = getFilteredCurrencies(searchInput.value);
  resultsContainer.innerHTML = "";

  if (!searchInput.value.trim()) {
    hideSearchResults(resultsContainer);
    return;
  }

  if (!matches.length) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "search-empty";
    emptyItem.textContent = "No matching currencies";
    resultsContainer.appendChild(emptyItem);
    resultsContainer.hidden = false;
    return;
  }

  matches.forEach(([code, name]) => {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-item";
    button.textContent = `${code} - ${name}`;
    button.addEventListener("click", () => {
      selectElement.value = code;
      searchInput.value = `${code} - ${name}`;
      hideSearchResults(resultsContainer);
      savePreferences();
      onAutoConvertInput();
    });
    li.appendChild(button);
    resultsContainer.appendChild(li);
  });

  resultsContainer.hidden = false;
}

function validateAmount(rawAmount) {
  if (rawAmount.trim() === "") {
    return "Please enter an amount.";
  }

  const amount = Number(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return "Enter a valid number greater than 0.";
  }

  return "";
}

async function convertCurrency() {
  const rawAmount = amountInput.value;
  const validationError = validateAmount(rawAmount);
  if (validationError) {
    setStatus(validationError, "error");
    resultContainer.textContent = "Converted amount will appear here.";
    return;
  }

  const amount = Number(rawAmount);
  const from = fromCurrencySelect.value;
  const to = toCurrencySelect.value;

  if (!from || !to) {
    setStatus("Select both currencies.", "error");
    return;
  }

  if (from === to) {
    setStatus("From and To are the same. Value stays unchanged.", "success");
    resultContainer.textContent = `${formatNumber(amount)} ${to}`;
    savePreferences();
    return;
  }

  try {
    setStatus("Converting...", "");
    const endpoint = `${CURRENCY_RATES_BASE_URL}/${encodeURIComponent(from.toLowerCase())}.min.json`;
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error("API response error.");
    }

    const data = await response.json();
    const baseRates = data[from.toLowerCase()];
    const rate = baseRates?.[to.toLowerCase()];
    if (typeof rate !== "number") {
      throw new Error("Invalid conversion result.");
    }
    const convertedValue = amount * rate;

    resultContainer.textContent = `${formatNumber(amount)} ${from} = ${formatNumber(convertedValue)} ${to}`;
    setStatus("Conversion successful.", "success");

    savePreferences();
    saveToHistory({
      amount: formatNumber(amount),
      from,
      to,
      converted: formatNumber(convertedValue),
      at: new Date().toISOString()
    });
  } catch (error) {
    setStatus("Failed to convert. Check your network and try again.", "error");
  }
}

function onAutoConvertInput() {
  if (!amountInput.value.trim()) {
    return;
  }
  convertCurrency();
}

function swapCurrencies() {
  const from = fromCurrencySelect.value;
  const to = toCurrencySelect.value;
  fromCurrencySelect.value = to;
  toCurrencySelect.value = from;
  fromSearchInput.value = "";
  toSearchInput.value = "";
  hideSearchResults(fromSearchResults);
  hideSearchResults(toSearchResults);
  savePreferences();
  onAutoConvertInput();
}

async function init() {
  setStatus("Loading currencies...");
  renderHistory();

  try {
    await fetchCurrencies();
    const preferences = readPreferences();
    const codes = allCurrencies.map(([code]) => code);
    const defaultFrom = preferences.from && currencyMap[preferences.from] ? preferences.from : "USD";
    const defaultTo = preferences.to && currencyMap[preferences.to] ? preferences.to : "EUR";

    populateCurrencySelect(fromCurrencySelect, defaultFrom, "");
    populateCurrencySelect(toCurrencySelect, defaultTo, "");

    // Fallback when API does not provide expected defaults.
    if (!codes.includes(defaultFrom) && codes[0]) {
      fromCurrencySelect.value = codes[0];
    }
    if (!codes.includes(defaultTo) && codes[1]) {
      toCurrencySelect.value = codes[1];
    }

    fromSearchInput.value = "";
    toSearchInput.value = "";
    setStatus(`Ready (${allCurrencies.length} currencies loaded)`);
  } catch {
    setStatus("Unable to load currencies. Refresh to retry.", "error");
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  convertCurrency();
});

amountInput.addEventListener("input", onAutoConvertInput);
fromSearchInput.addEventListener("input", () => {
  renderSearchResults(fromSearchInput, fromSearchResults, fromCurrencySelect);
});
toSearchInput.addEventListener("input", () => {
  renderSearchResults(toSearchInput, toSearchResults, toCurrencySelect);
});
fromSearchInput.addEventListener("focus", () => {
  renderSearchResults(fromSearchInput, fromSearchResults, fromCurrencySelect);
});
toSearchInput.addEventListener("focus", () => {
  renderSearchResults(toSearchInput, toSearchResults, toCurrencySelect);
});
fromCurrencySelect.addEventListener("change", () => {
  savePreferences();
  onAutoConvertInput();
});
toCurrencySelect.addEventListener("change", () => {
  savePreferences();
  onAutoConvertInput();
});
swapButton.addEventListener("click", swapCurrencies);
document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) {
    return;
  }

  if (!fromSearchInput.contains(event.target) && !fromSearchResults.contains(event.target)) {
    hideSearchResults(fromSearchResults);
  }
  if (!toSearchInput.contains(event.target) && !toSearchResults.contains(event.target)) {
    hideSearchResults(toSearchResults);
  }
});

init();
