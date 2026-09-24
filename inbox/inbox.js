const emails = [
  {
    id: 1,
    from: "Michael R.",
    email: "michael@example.com",
    subject: "Financing question",
    preview: "Do you work with people that have bad credit?",
    body: "Hi, I saw one of your cars online. Do you work with people that have bad credit? I am interested in financing if possible.",
    time: "11:42 AM",
    status: "new"
  },
  {
    id: 2,
    from: "Sarah M.",
    email: "sarah@example.com",
    subject: "Is the Camry still available?",
    preview: "I wanted to check if the Toyota Camry is still there.",
    body: "Hello, I wanted to check if the Toyota Camry I saw online is still available. I may be able to come by this afternoon.",
    time: "10:18 AM",
    status: "review"
  },
  {
    id: 3,
    from: "Daniel T.",
    email: "daniel@example.com",
    subject: "Appointment for Saturday",
    preview: "Can I come by around 2 PM Saturday?",
    body: "Can I come by around 2 PM Saturday to look at the Accord? Please let me know if that works.",
    time: "9:36 AM",
    status: "ai"
  },
  {
    id: 4,
    from: "Jennifer K.",
    email: "jennifer@example.com",
    subject: "Trade-in question",
    preview: "Do you take trade-ins?",
    body: "Hi, do you take trade-ins? I have a 2014 Nissan Altima and I am looking at one of your SUVs.",
    time: "Yesterday",
    status: "new"
  }
];

const list = document.getElementById("emailList");
const search = document.getElementById("searchInput");
const filter = document.getElementById("statusFilter");

let selectedEmail = null;

function labelFor(status) {
  if (status === "new") return "New";
  if (status === "review") return "Needs Review";
  if (status === "ai") return "AI Replied";
  return status;
}

function renderList() {
  const term = search.value.toLowerCase();
  const wanted = filter.value;

  const filtered = emails.filter(email => {
    const matchesSearch = `${email.from} ${email.subject} ${email.preview}`.toLowerCase().includes(term);
    const matchesFilter = wanted === "all" || email.status === wanted;
    return matchesSearch && matchesFilter;
  });

  list.innerHTML = "";

  filtered.forEach(email => {
    const item = document.createElement("div");
    item.className = "email-item" + (selectedEmail?.id === email.id ? " active" : "");
    item.innerHTML = `
      <div class="row">
        <h3>${email.from}</h3>
        <small>${email.time}</small>
      </div>
      <strong>${email.subject}</strong>
      <p>${email.preview}</p>
    `;
    item.addEventListener("click", () => openEmail(email));
    list.appendChild(item);
  });
}

function openEmail(email) {
  selectedEmail = email;
  document.getElementById("emptyState").classList.add("hidden");
  document.getElementById("emailView").classList.remove("hidden");
  document.getElementById("emailSubject").textContent = email.subject;
  document.getElementById("emailMeta").textContent = `${email.from} <${email.email}>`;
  document.getElementById("emailStatus").textContent = labelFor(email.status);
  document.getElementById("emailBody").textContent = email.body;
  document.getElementById("replyText").value = "";
  renderList();
}

document.getElementById("generateReply").addEventListener("click", () => {
  if (!selectedEmail) return;

  let reply = `Hi ${selectedEmail.from.split(" ")[0]},\n\nThank you for reaching out to Auto One Motors. `;

  if (selectedEmail.subject.toLowerCase().includes("financing")) {
    reply += "We work with customers in many different credit situations and would be happy to go over your options. Which vehicle are you interested in?";
  } else if (selectedEmail.subject.toLowerCase().includes("available")) {
    reply += "I'd be happy to help check the vehicle's availability for you. We will confirm the current status before your visit.";
  } else if (selectedEmail.subject.toLowerCase().includes("appointment")) {
    reply += "We'd be happy to help schedule your visit. We can confirm the requested time before you come in.";
  } else if (selectedEmail.subject.toLowerCase().includes("trade")) {
    reply += "Yes, we can look at trade-ins. You can bring the vehicle with you so our team can take a look and discuss the next steps.";
  } else {
    reply += "We received your message and would be happy to help.";
  }

  reply += "\n\nAuto One Motors";
  document.getElementById("replyText").value = reply;
});

document.getElementById("saveDraft").addEventListener("click", () => {
  alert("Draft saved locally for testing. Supabase will be connected later.");
});

document.getElementById("sendReply").addEventListener("click", () => {
  alert("Sending is disabled in this UI version. Gmail API comes next.");
});

search.addEventListener("input", renderList);
filter.addEventListener("change", renderList);
renderList();