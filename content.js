function extractEvents() {
  const events = document.querySelectorAll('[role="button"][data-eventchip]')
  const result = []

  events.forEach(e => {
    const title = e.innerText.trim()

    const isHoliday =
      title.includes("祝日") ||
      title.includes("Holiday") ||
      title.includes("春分") ||
      title.includes("秋分")

    if (isHoliday) return

    result.push({
      title: title,
      captured: new Date().toISOString()
    })
  })

  return result
}


function saveEvents() {
  const events = extractEvents()


  chrome.storage.local.set({
    calendar_events: events
  })


  console.log("Saved events:", events.length)
}




// 初回実行
setTimeout(saveEvents, 3000)




// 🔥 ここが重要（追加）
const observer = new MutationObserver(() => {
  console.log("Calendar changed → re-scan")
  saveEvents()
})


// body全体を監視
observer.observe(document.body, {
  childList: true,
  subtree: true
})
