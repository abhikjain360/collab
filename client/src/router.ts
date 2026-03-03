if (window.location.pathname.startsWith("/d/")) {
    import("./editor")
} else {
    import("./dashboard")
}
