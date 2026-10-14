
import express from "express";
import cors from "cors";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const app = express();
const PORT = 3000;
const API_TOKEN = process.argv[2];
const DATA_FILE = join(dirname(fileURLToPath(import.meta.url)), "transactions.json");

app.use(cors());
app.use(express.json());

let transactions = [];
let nextId = 1;

async function loadTransactions() {
  try {
    transactions = JSON.parse(await readFile(DATA_FILE, "utf8"));
    nextId = transactions.reduce((max, item) => Math.max(max, item.id), 0) + 1;
  } catch (error) {
    if (error.code === "ENOENT") await saveTransactions();
    else throw error;
  }
}

async function saveTransactions() {
  await writeFile(DATA_FILE, JSON.stringify(transactions, null, 2), "utf8");
}

// Bearer token authentication
app.use("/api", (req, res, next) => {
  if (req.headers.authorization !== `Bearer ${API_TOKEN}`)
    return res.status(401).json({ error: "Unauthorized" });
  next();
});

app.get("/", (req, res) => res.send("Finance Tracker API"));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Get all transactions or filter by type
app.get("/api/transactions", (req, res) => {
  const { type } = req.query;
  const result = type
    ? transactions.filter((item) => item.type === type)
    : transactions;

  res.json(result.map((item) => ({ ...item })));
});

// Summary using filter and reduce
app.get("/api/transactions/summary", (req, res) => {
  const income = transactions
    .filter((item) => item.type === "income")
    .reduce((sum, item) => sum + item.amount, 0);

  const expenses = transactions
    .filter((item) => item.type === "expense")
    .reduce((sum, item) => sum + item.amount, 0);

  res.json({ income, expenses, balance: income - expenses });
});

// Get one transaction
app.get("/api/transactions/:id", (req, res) => {
  const transaction = transactions.find((item) => item.id === Number(req.params.id));

  if (!transaction) return res.status(404).json({ error: "Transaction not found" });
  res.json(transaction);
});

// Create transaction
app.post("/api/transactions", async (req, res, next) => {
  try {
    const { type, amount, category, note, date } = req.body;

    const transaction = {
      id: nextId++,
      type,
      amount: Number(amount),
      category,
      note: note ?? "",
      date: date ?? new Date().toISOString().slice(0, 10),
    };

    transactions.push(transaction);
    await saveTransactions();
    res.status(201).json(transaction);
  } catch (error) {
    next(error);
  }
});

// Replace transaction
app.put("/api/transactions/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const index = transactions.findIndex((item) => item.id === id);

    if (index === -1) return res.status(404).json({ error: "Transaction not found" });

    const { type, amount, category, note, date } = req.body;
    transactions[index] = { id, type, amount: Number(amount), category, note: note ?? "", date };

    await saveTransactions();
    res.json(transactions[index]);
  } catch (error) {
    next(error);
  }
});

// Update selected fields
app.patch("/api/transactions/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const index = transactions.findIndex((item) => item.id === id);

    if (index === -1) return res.status(404).json({ error: "Transaction not found" });

    const updated = { ...transactions[index], ...req.body, id };
    if ("amount" in req.body) updated.amount = Number(req.body.amount);

    transactions[index] = updated;
    await saveTransactions();
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// Delete transaction
app.delete("/api/transactions/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const before = transactions.length;
    transactions = transactions.filter((item) => item.id !== id);

    if (transactions.length === before)
      return res.status(404).json({ error: "Transaction not found" });

    await saveTransactions();
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Basic error handling
app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

async function startServer() {
  try {
    await loadTransactions();
    app.listen(PORT, () => console.log(`API running at http://localhost:${PORT}`));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (!API_TOKEN) {
  console.error("Run: node app.js secret123");
  process.exit(1);
}

startServer();
