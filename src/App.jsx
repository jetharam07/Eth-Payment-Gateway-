import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContract, getReadOnlyContract } from "./contract"; // Smart contract helper
import "./App.css";

export default function App() {
  // --- State Variables ---
  const [connectedAccount, setConnectedAccount] = useState(null);
  const [ownerAddress, setOwnerAddress] = useState(null);
  const [contractBalance, setContractBalance] = useState("0");
  const [userTxs, setUserTxs] = useState([]);
  const [allTxs, setAllTxs] = useState([]);
  const [amount, setAmount] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState("user"); // user/admin toggle
  const [refundId, setRefundId] = useState("");
  const [detailTx, setDetailTx] = useState(null); // modal transaction detail
  const [buttonLoading, setButtonLoading] = useState({}); // individual button loader
  const [alert, setAlert] = useState(null); // custom alert for notifications

  // --- CUSTOM ALERT FUNCTION ---
  const showAlert = (message, type = "success") => {
    setAlert({ message, type });
    setTimeout(() => setAlert(null), 2500); // auto-hide
  };

  // --- CONNECT WALLET ---
  const connectWallet = async () => {
    if (!window.ethereum) return showAlert("Please install MetaMask", "error");
    const [acc] = await window.ethereum.request({ method: "eth_requestAccounts" });
    setConnectedAccount(acc);
  };

  // --- LOAD OWNER ADDRESS & CONTRACT BALANCE ---
  const loadOwnerAndBalance = async () => {
    try {
      const roContract = await getReadOnlyContract();
      const owner = await roContract.owner();
      setOwnerAddress(owner);
      const bal = await roContract.getContractBalance();
      setContractBalance(ethers.formatEther(bal));
    } catch (e) { console.error(e); }
  };

  // --- LOAD USER TRANSACTIONS (Last 10) ---
  const loadUserTxs = async () => {
    try {
      if (!connectedAccount) { setUserTxs([]); return; }
      const contract = await getReadOnlyContract();
      const txs = await contract.getUserTransactions(connectedAccount);
      setUserTxs([...txs].slice(-10).reverse());
    } catch (e) { console.error(e); }
  };

  // --- LOAD ALL TRANSACTIONS (Last 10) ---
  const loadAllTxs = async () => {
    try {
      const contract = await getReadOnlyContract();
      const txs = await contract.getLastTransactions();
      setAllTxs([...txs].slice(-10).reverse());
    } catch (e) { console.error(e); }
  };

  // --- MAKE PAYMENT FUNCTION ---
  const makePayment = async () => {
    if (!paymentRef || !amount) return showAlert("Enter message and amount", "error");
    if (Number(amount) <= 0) return showAlert("Amount must be > 0", "error");
    try {
      setButtonLoading(prev => ({ ...prev, pay: true }));
      const contract = await getContract();
      const tx = await contract.pay(paymentRef, { value: ethers.parseEther(amount) });
      await tx.wait();
      showAlert("Payment successful ✅", "success");
      setPaymentRef(""); setAmount("");
      await Promise.all([loadUserTxs(), loadOwnerAndBalance(), loadAllTxs()]);
    } catch (e) { showAlert(`Payment failed: ${e?.message || e}`, "error"); }
    finally { setButtonLoading(prev => ({ ...prev, pay: false })); }
  };

  // --- REFUND TRANSACTION (Admin Only) ---
  const refundTx = async (idParam) => {
    const id = idParam ?? refundId;
    if (!id) return showAlert("Enter transaction ID to refund", "error");
    if (!connectedAccount) return showAlert("Connect wallet as admin", "error");
    if (connectedAccount.toLowerCase() !== ownerAddress?.toLowerCase())
      return showAlert("Connected account is not owner", "error");
    try {
      setButtonLoading(prev => ({ ...prev, [`refund-${id}`]: true }));
      const contract = await getContract();
      const tx = await contract.refund(id);
      await tx.wait();
      showAlert("Refund successful ✅", "success");
      setRefundId("");
      await Promise.all([loadOwnerAndBalance(), loadAllTxs(), loadUserTxs()]);
    } catch (e) { showAlert(`Refund failed: ${e?.message || e}`, "error"); }
    finally { setButtonLoading(prev => ({ ...prev, [`refund-${id}`]: false })); }
  };

  // --- WITHDRAW FUNCTION (Admin Only) ---
  const withdraw = async () => {
    if (!connectedAccount) return showAlert("Connect wallet as admin", "error");
    if (connectedAccount.toLowerCase() !== ownerAddress?.toLowerCase())
      return showAlert("Connected account is not owner", "error");
    try {
      setButtonLoading(prev => ({ ...prev, withdraw: true }));
      const contract = await getContract();
      const tx = await contract.withdraw();
      await tx.wait();
      showAlert("Withdraw successful ✅", "success");
      await loadOwnerAndBalance();
    } catch (e) { showAlert(`Withdraw failed: ${e?.message || e}`, "error"); }
    finally { setButtonLoading(prev => ({ ...prev, withdraw: false })); }
  };

  // --- VIEW TOGGLE ---
  const toggleView = (v) => setView(v);

  // --- EFFECTS ---
  useEffect(() => {
    loadOwnerAndBalance();
    loadAllTxs();
    // Handle wallet/account changes dynamically
    if (window.ethereum) {
      window.ethereum.on?.("accountsChanged", (accounts) => setConnectedAccount(accounts[0] ?? null));
      window.ethereum.on?.("chainChanged", () => window.location.reload());
    }
  }, []);

  useEffect(() => { loadUserTxs(); }, [connectedAccount]);

  // --- HELPER: Shorten address / text ---
  const shortText = (str, start = 6, end = 4) => str ? `${str.slice(0,start)}...${str.slice(-end)}` : "—";

  // --- RENDER TRANSACTION ROW ---
  const renderTxRow = (tx, idx, isAdminView=false) => (
    <tr key={idx}>
      <td>{tx.id}</td>
      <td>{shortText(tx.user)}</td>
      <td>{ethers.formatEther(tx.amount)} ETH</td>
      <td>{shortText(tx.paymentRef)}</td>
      <td className={tx.status==="Refunded"?"status-refunded":"status-paid"}>{tx.status}</td>
      <td>{new Date(Number(tx.timestamp)*1000).toLocaleString()}</td>
      {isAdminView && <td>
        {tx.status==="Paid" ? (
          <button
            onClick={()=>refundTx(tx.id)}
            className="action-btn"
            disabled={buttonLoading[`refund-${tx.id}`]}
          >
            {buttonLoading[`refund-${tx.id}`] ? "Processing..." : "Refund"}
          </button>
        ) : <span>—</span>}
      </td>}
      <td>
        <button
          className="action-btn view-detail-btn"
          onClick={() => setDetailTx(tx)}
        >
          View Detail
        </button>
      </td>
    </tr>
  );

  const closeModal = () => setDetailTx(null);

  return (
    <div className="app">
      {/* --- ALERT --- */}
      {alert && (
        <div className={`custom-alert ${alert.type}`}>
          {alert.message}
        </div>
      )}

      {/* --- HEADER --- */}
      <header className="top">
        <h1>💸 Payment Gateway</h1>
        <div className="controls">
          {!connectedAccount ? (
            <button onClick={connectWallet}>Connect Wallet</button>
          ) : (
            <div className="connected">{shortText(connectedAccount)}</div>
          )}
          <div className="view-toggle">
            {view === "user" ? (
              <button onClick={() => toggleView("admin")}>Switch to Admin</button>
            ) : (
              <button onClick={() => toggleView("user")}>Switch to User</button>
            )}
          </div>
          <button
            className="refresh"
            onClick={async () => {
              await Promise.all([loadOwnerAndBalance(), loadUserTxs(), loadAllTxs()]);
            }}
          >
            Refresh
          </button>
        </div>
      </header>

      {/* --- MAIN CONTENT --- */}
      <main className="main">
        {/* Top cards */}
        <section className="top-cards">
          <div className="card">
            <h3>Contract Info</h3>
            <p>Owner: <span className="mono">{shortText(ownerAddress)}</span></p>
            <p>Contract Balance: <strong>{contractBalance} ETH</strong></p>
            <p>Active View: <strong>{view}</strong></p>
          </div>

          {/* User Payment Panel */}
          {view === "user" && (
            <div className="card">
              <h3>Make Payment</h3>
              <input
                placeholder="Payment message / reference"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
              />
              <input
                type="number"
                placeholder="Amount in ETH (e.g. 0.01)"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <button
                onClick={makePayment}
                disabled={buttonLoading.pay}
              >
                {buttonLoading.pay ? "Processing..." : "Pay"}
              </button>
            </div>
          )}

          {/* Admin Panel */}
          {view === "admin" && (
            <div className="card">
              <h3>Admin Actions</h3>
              <p style={{ fontSize: 13 }}>- Actions allowed only for owner</p>
              <div className="admin-actions">
                <button
                  onClick={withdraw}
                  disabled={buttonLoading.withdraw}
                >
                  {buttonLoading.withdraw ? "Processing..." : "Withdraw Balance"}
                </button>
                <div className="refund-block">
                  <input
                    placeholder="Transaction ID to refund"
                    value={refundId}
                    onChange={(e) => setRefundId(e.target.value)}
                  />
                  <button
                    onClick={() => refundTx()}
                    disabled={buttonLoading[`refund-${refundId}`]}
                  >
                    {buttonLoading[`refund-${refundId}`] ? "Processing..." : "Refund by ID"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Transaction Table */}
        <section className="bottom-card">
          <div className="card fullwidth">
            <h3>
              {view === "user" ? "Your Recent Transactions" : "All Recent Transactions (last 10)"}
            </h3>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>User</th>
                    <th>Amount</th>
                    <th>Ref</th>
                    <th>Status</th>
                    <th>Time</th>
                    {view==="admin" && <th>Action</th>}
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {(view==="user" ? userTxs : allTxs).length === 0 ? (
                    <tr>
                      <td colSpan={view==="admin"?8:7}>No transactions found.</td>
                    </tr>
                  ) : (
                    (view==="user" ? userTxs : allTxs).map((tx, i) => renderTxRow(tx, i, view==="admin"))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      {/* Transaction Detail Modal */}
      {detailTx && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Transaction Details</h3>
            <p><strong>ID:</strong> {detailTx.id}</p>
            <p><strong>User:</strong> {detailTx.user}</p>
            <p><strong>Amount:</strong> {ethers.formatEther(detailTx.amount)} ETH</p>
            <p><strong>Ref:</strong> {detailTx.paymentRef}</p>
            <p><strong>Status:</strong> {detailTx.status}</p>
            <p><strong>Timestamp:</strong> {new Date(Number(detailTx.timestamp)*1000).toLocaleString()}</p>
            {view==="admin" && <p><strong>Admin Action:</strong> {detailTx.status==="Paid"?"Refundable":"—"}</p>}
            <button onClick={closeModal}>Close</button>
          </div>
        </div>
      )}

      {/* How-to-Use Section */}
      <section className="how-to-modern">
        <div className="how-to-container">
          <div className="title-container">
            <span className="emoji">🚀</span>
            <h2 className="how-to-modern">How to Use This DApp</h2>
          </div>
          <p className="intro">
            Easily send, track, and manage payments on the Ethereum Sepolia Testnet. Connect your wallet, make payments, and stay on top of every transaction seamlessly.
          </p>

          <div className="steps-grid">
            {[ 
              "Connect your MetaMask wallet using the Connect Wallet button.",
              "Ensure you are on the Sepolia Test Network and have some test ETH.",
              "Enter a Payment Message / Reference and the Amount in ETH.",
              "Click Pay and wait for blockchain confirmation.",
              "Check Your Transactions to see the payment status.",
              "Switch to Admin View to refund or withdraw if you are the owner.",
              "Use Refresh to sync the latest blockchain data."
            ].map((text, idx) => (
              <div className="step-card" key={idx}>
                <div className="step-number">{idx+1}</div>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="foot">
        <small>
          Tip: Make sure MetaMask is on Sepolia and your account has test ETH.
        </small>
      </footer>
    </div>
  );
}
