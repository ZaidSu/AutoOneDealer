const data = [
  { day: "Mon", count: 18 },
  { day: "Tue", count: 27 },
  { day: "Wed", count: 22 },
  { day: "Thu", count: 31 },
  { day: "Fri", count: 25 },
  { day: "Sat", count: 14 },
  { day: "Sun", count: 8 }
];

const max = Math.max(...data.map(x => x.count));
const bars = document.getElementById("bars");

data.forEach(item => {
  const wrap = document.createElement("div");
  wrap.className = "bar-wrap";
  const height = (item.count / max) * 240;
  wrap.innerHTML = `<div class="bar" style="height:${height}px" title="${item.count} emails"></div><span>${item.day}</span>`;
  bars.appendChild(wrap);
});