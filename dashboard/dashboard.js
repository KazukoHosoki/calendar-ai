function render(events) {
  const eventsView = document.getElementById("events-view")
  const summaryView = document.getElementById("summary-view")

  eventsView.innerHTML = ""

  if (events.length === 0) {
    eventsView.innerHTML = "<p>No events found</p>"
  } else {
    events.forEach(e => {
      const div = document.createElement("div")
      div.className = "card"

      div.innerHTML = `
        <b>${e.title}</b>
        <div>${e.captured}</div>
      `

      eventsView.appendChild(div)
    })
  }

  // summary
  const summary = generateSummary(events)

  summaryView.innerHTML = `
    <div class="card">
      <h3>📈 Summary</h3>
      <p>Total Events: ${summary.total}</p>
      <p>Most Common: ${summary.mostCommon}</p>
    </div>
  `
}


// 🔵 初回読み込み
chrome.storage.local.get("calendar_events", (data) => {
  render(data.calendar_events || [])
})


// 🔥 リアルタイム更新（これが超重要）
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.calendar_events) {
    render(changes.calendar_events.newValue || [])
  }
})


// -------------------
function generateSummary(records) {
  const total = records.length

  const counter = {}

  records.forEach(r => {
    const key = r.title.split(" ")[0]
    counter[key] = (counter[key] || 0) + 1
  })

  let mostCommon = ""
  let max = 0

  for (let k in counter) {
    if (counter[k] > max) {
      max = counter[k]
      mostCommon = k
    }
  }

  return {
    total,
    mostCommon
  }
}