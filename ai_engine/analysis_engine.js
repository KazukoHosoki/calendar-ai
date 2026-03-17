function analyzeMeeting(ragRecord) {

    const summary =
        `Meeting "${ragRecord.title}" occurred at ${ragRecord.time_text}.`;

    const decisions = [
        "Decision extraction placeholder"
    ];

    const actions = [
        {
            task: "Follow up meeting notes",
            assigned_to: ragRecord.organizer || "Unknown",
            deadline: null
        }
    ];

    return {
        summary,
        decisions,
        actions
    };
}

window.analyzeMeeting = analyzeMeeting;