const recent = [
  { name: "Michael R.", subject: "Financing question", time: "11:42 AM" },
  { name: "Sarah M.", subject: "Is the Camry still available?", time: "10:18 AM" },
  { name: "Daniel T.", subject: "Appointment for Saturday", time: "9:36 AM" },
  { name: "Jennifer K.", subject: "Trade-in question", time: "Yesterday" }
];

const container = document.getElementById("recentEmails");

recent.forEach(email => {
  const row = document.createElement("div");
  row.className = "email-row";
  row.innerHTML = `
    <strong>${email.name}</strong>
    <p>${email.subject}</p>
    <small>${email.time}</small>
  `;
  container.appendChild(row);
});

document.getElementById("connectButton").addEventListener("click", () => {
  alert("Next step: connect this button to Google OAuth and the Gmail API.");
});