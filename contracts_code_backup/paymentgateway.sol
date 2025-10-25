// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract PaymentGateway {
    address public owner;
    uint256 public transactionCount;

    struct Transaction {
        uint256 id;
        address user;
        uint256 amount;
        string paymentRef;
        uint256 timestamp;
        string status; // "Paid", "Refunded", "Withdrawn"
    }

    mapping(uint256 => Transaction) public transactions;
    mapping(address => uint256[]) public userTransactions;

    event PaymentReceived(uint256 indexed id, address indexed user, uint256 amount, string paymentRef, uint256 timestamp);
    event Refunded(uint256 indexed id, address indexed user, uint256 amount, uint256 timestamp);
    event Withdrawn(address indexed admin, uint256 amount, uint256 timestamp);

    constructor() {
        owner = msg.sender;
    }

    //  USER: Pay with a reference string
    function pay(string memory paymentRef) external payable {
        require(msg.value > 0, "Payment must be greater than 0");

        transactionCount++;
        transactions[transactionCount] = Transaction({
            id: transactionCount,
            user: msg.sender,
            amount: msg.value,
            paymentRef: paymentRef,
            timestamp: block.timestamp,
            status: "Paid"
        });

        userTransactions[msg.sender].push(transactionCount);

        emit PaymentReceived(transactionCount, msg.sender, msg.value, paymentRef, block.timestamp);
    }

    //  ADMIN: Withdraw all contract funds to admin wallet
    function withdraw() external onlyOwner {
        uint256 amount = address(this).balance;
        require(amount > 0, "No funds to withdraw");

        payable(owner).transfer(amount);
        emit Withdrawn(owner, amount, block.timestamp);
    }

    //  ADMIN: Refund a specific transaction to user
    function refund(uint256 id) external onlyOwner {
        Transaction storage txn = transactions[id];
        require(txn.amount > 0, "Invalid transaction");
        require(keccak256(bytes(txn.status)) == keccak256(bytes("Paid")), "Already refunded or withdrawn");

        payable(txn.user).transfer(txn.amount);
        txn.status = "Refunded";

        emit Refunded(id, txn.user, txn.amount, block.timestamp);
    }

    //  VIEW: Get contract balance
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    //  VIEW: Get last 10 transactions (for admin)
    function getLastTransactions() external view returns (Transaction[] memory) {
        uint256 start = transactionCount > 10 ? transactionCount - 9 : 1;
        uint256 length = transactionCount >= 10 ? 10 : transactionCount;

        Transaction[] memory recent = new Transaction[](length);
        uint256 index = 0;

        for (uint256 i = start; i <= transactionCount; i++) {
            recent[index] = transactions[i];
            index++;
        }

        return recent;
    }

    //  VIEW: Get user’s transactions
    function getUserTransactions(address user) external view returns (Transaction[] memory) {
        uint256[] memory ids = userTransactions[user];
        Transaction[] memory txns = new Transaction[](ids.length);

        for (uint256 i = 0; i < ids.length; i++) {
            txns[i] = transactions[ids[i]];
        }

        return txns;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not admin");
        _;
    }
}
