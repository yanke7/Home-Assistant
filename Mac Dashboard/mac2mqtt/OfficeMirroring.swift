import AppKit
import ApplicationServices

func fail(_ message: String) -> Never {
    fputs(message + "\n", stderr)
    exit(1)
}
let mode = CommandLine.arguments.dropFirst().first ?? ""
guard ["start", "stop", "cameras"].contains(mode) else { fail("Expected start, stop or cameras") }
guard AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary) else {
    fail("Allow mac2mqtt in System Settings > Privacy & Security > Accessibility, then retry")
}
func attr(_ e: AXUIElement, _ key: String) -> CFTypeRef? {
    var v: CFTypeRef?
    guard AXUIElementCopyAttributeValue(e, key as CFString, &v) == .success else { return nil }
    return v
}
func text(_ e: AXUIElement, _ key: String) -> String { attr(e,key) as? String ?? "" }
func nodes(_ root: AXUIElement) -> [AXUIElement] {
    var result: [AXUIElement] = []; var queue = [(root,0)]
    while !queue.isEmpty && result.count < 2000 {
        let (e,depth) = queue.removeFirst(); result.append(e)
        if depth < 18, let children = attr(e,kAXChildrenAttribute) as? [AXUIElement] {
            queue += children.map { ($0, depth+1) }
        }
    }
    return result
}
func find(_ root: AXUIElement, _ role: String, _ predicate: (AXUIElement)->Bool) -> AXUIElement? {
    nodes(root).first { text($0,kAXRoleAttribute) == role && predicate($0) }
}
func waitFor(_ seconds: Double = 15, _ predicate: () -> AXUIElement?) -> AXUIElement? {
    let end = Date().addingTimeInterval(seconds)
    repeat { if let e=predicate() { return e }; Thread.sleep(forTimeInterval:0.3) } while Date()<end
    return nil
}
func press(_ e: AXUIElement) {
    guard AXUIElementPerformAction(e,kAXPressAction as CFString) == .success else { fail("Could not activate the macOS mirroring control") }
}
func selectOffice(_ e: AXUIElement) {
    // macOS Displays accepts AXPress but sometimes does not select an AirPlay tile.
    // Click its current accessibility-provided bounds, rather than fixed screen coordinates.
    guard let pv=attr(e,kAXPositionAttribute), let sv=attr(e,kAXSizeAttribute) else { press(e); return }
    var point=CGPoint.zero; var size=CGSize.zero
    guard AXValueGetValue(pv as! AXValue,.cgPoint,&point), AXValueGetValue(sv as! AXValue,.cgSize,&size) else { press(e); return }
    let center=CGPoint(x:point.x+size.width/2,y:point.y+size.height/2)
    CGEvent(mouseEventSource:nil,mouseType:.leftMouseDown,mouseCursorPosition:center,mouseButton:.left)?.post(tap:.cghidEventTap)
    CGEvent(mouseEventSource:nil,mouseType:.leftMouseUp,mouseCursorPosition:center,mouseButton:.left)?.post(tap:.cghidEventTap)
    Thread.sleep(forTimeInterval:0.4)
}
let original = NSWorkspace.shared.frontmostApplication
NSWorkspace.shared.open(URL(string:"x-apple.systempreferences:com.apple.Displays-Settings.extension")!)
guard let app = waitFor(12, {
    guard let process = NSRunningApplication.runningApplications(withBundleIdentifier:"com.apple.systempreferences").first else { return nil }
    let a=AXUIElementCreateApplication(process.processIdentifier)
    return find(a,kAXWindowRole) { text($0,kAXTitleAttribute)=="Displays" } == nil ? nil : a
}) else { fail("Could not open Displays settings") }
func office() -> AXUIElement? {
    find(app,kAXButtonRole) { text($0,kAXTitleAttribute)=="Airplay Video Office" || text($0,kAXDescriptionAttribute)=="Airplay Video Office" }
}
if mode != "stop" {
    if office() == nil {
        guard let add=find(app,kAXMenuButtonRole,{ text($0,kAXDescriptionAttribute).hasPrefix("Display settings for") }) else { fail("Display connection menu not found") }
        press(add)
        guard let target=waitFor(15,{find(app,kAXMenuItemRole,{text($0,kAXTitleAttribute)=="Office"})}) else { fail("Office Apple TV is not available in the AirPlay menu") }
        press(target)
    }
    guard waitFor(25,{office()}) != nil else { fail("Office did not connect; check the TV for an AirPlay code") }
    guard let use=waitFor(12,{
        if let current=office() { selectOffice(current) }
        guard find(app,kAXButtonRole,{text($0,kAXDescriptionAttribute)=="Disconnect" || text($0,kAXTitleAttribute)=="Disconnect"}) != nil else { return nil }
        return find(app,kAXPopUpButtonRole,{["Extended display", "Main display", "Mirror for Built-in Display"].contains(text($0,kAXValueAttribute))})
    }) else { fail("Office display mode control not found") }
    if text(use,kAXValueAttribute) != "Extended display" {
        press(use)
        guard let mirror=waitFor(5,{find(app,kAXMenuItemRole,{["Extended display", "Stop Mirroring"].contains(text($0,kAXTitleAttribute))})}) else { fail("Extended display option not found") }
        press(mirror)
    }
    guard waitFor(8,{find(app,kAXPopUpButtonRole,{text($0,kAXValueAttribute)=="Extended display"})}) != nil else { fail("Could not verify extended display") }
    if mode == "start" { print("Desktop extended to Office") }
} else {
    if let target=office() {
        selectOffice(target)
        guard let disconnect=waitFor(5,{find(app,kAXButtonRole,{text($0,kAXDescriptionAttribute)=="Disconnect" || text($0,kAXTitleAttribute)=="Disconnect"})}) else { fail("Office disconnect control not found") }
        press(disconnect)
        let end=Date().addingTimeInterval(15)
        while office() != nil && Date()<end { Thread.sleep(forTimeInterval:0.3) }
        guard office()==nil else { fail("Office is still connected") }
    }
    print("Office display disconnected")
}
if mode == "cameras" {
    let screenDeadline = Date().addingTimeInterval(12)
    var officeScreen: NSScreen?
    repeat {
        officeScreen = NSScreen.screens.first { ["Office", "Office (AirPlay)", "Airplay Video Office"].contains($0.localizedName) }
        if officeScreen != nil { break }
        RunLoop.current.run(until: Date().addingTimeInterval(0.3))
    } while Date() < screenDeadline
    guard let screen = officeScreen, let displayID = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber else {
        fail("Office connected but its desktop could not be identified: " + NSScreen.screens.map { $0.localizedName }.joined(separator: ", "))
    }
    let visible=screen.visibleFrame
    let primaryHeight=NSScreen.screens.first!.frame.height
    let bounds=CGRect(x:visible.minX,y:primaryHeight-visible.maxY,width:visible.width,height:visible.height)
    func diagnostic(_ value: String) {
        let url=URL(fileURLWithPath:NSHomeDirectory()+"/mac2mqtt/mirroring/placement.log")
        if !FileManager.default.fileExists(atPath:url.path) { FileManager.default.createFile(atPath:url.path,contents:nil) }
        if let h=try? FileHandle(forWritingTo:url) { h.seekToEndOfFile();h.write((Date().description+" "+value+"\n").data(using:.utf8)!);try? h.close() }
    }
    diagnostic("Office=\(screen.localizedName) id=\(displayID) frame=\(screen.frame) visible=\(visible) target=\(bounds) CG=\(CGDisplayBounds(displayID.uint32Value))")
    let config = NSWorkspace.OpenConfiguration(); config.activates = true
    var launched: NSRunningApplication?; var launchError: Error?; var finished = false
    NSWorkspace.shared.openApplication(at: URL(fileURLWithPath:"/Applications/Reolink.app"), configuration:config) { process,error in
        launched=process; launchError=error; finished=true
    }
    let launchDeadline=Date().addingTimeInterval(15)
    while !finished && Date()<launchDeadline { RunLoop.current.run(until:Date().addingTimeInterval(0.1)) }
    guard let process=launched else { fail("Could not launch Reolink: " + (launchError?.localizedDescription ?? "timed out")) }
    let reolink=AXUIElementCreateApplication(process.processIdentifier)
    guard let window=waitFor(65, {
        (attr(reolink,kAXWindowsAttribute) as? [AXUIElement])?.first { text($0,kAXRoleAttribute)==kAXWindowRole && text($0,kAXTitleAttribute)=="Reolink" }
    }) else { fail("Reolink opened but no movable window appeared") }
    AXUIElementSetAttributeValue(window,kAXMinimizedAttribute as CFString,kCFBooleanFalse)
    let fullscreenResult=AXUIElementSetAttributeValue(window,"AXFullScreen" as CFString,kCFBooleanFalse)
    diagnostic("window=\(text(window,kAXTitleAttribute)) fullscreenResult=\(fullscreenResult.rawValue) fullscreen=\(String(describing:attr(window,"AXFullScreen")))")
    Thread.sleep(forTimeInterval:2)
    process.activate()
    Thread.sleep(forTimeInterval:0.5)
    var position=CGPoint(x:bounds.minX+8,y:bounds.minY+32)
    var size=CGSize(width:bounds.width-16,height:bounds.height-40)
    let end=Date().addingTimeInterval(8)
    var moved=false
    repeat {
        guard let pv=AXValueCreate(.cgPoint,&position),let sv=AXValueCreate(.cgSize,&size) else { fail("Could not calculate Office window bounds") }
        let moveResult=AXUIElementSetAttributeValue(window,kAXPositionAttribute as CFString,pv)
        let sizeResult=AXUIElementSetAttributeValue(window,kAXSizeAttribute as CFString,sv)
        diagnostic("move=\(moveResult.rawValue) resize=\(sizeResult.rawValue)")
        AXUIElementPerformAction(window,kAXRaiseAction as CFString)
        Thread.sleep(forTimeInterval:0.4)
        if let value=attr(window,kAXPositionAttribute), let dimensions=attr(window,kAXSizeAttribute) {
            var actual=CGPoint.zero;var actualSize=CGSize.zero
            if AXValueGetValue(value as! AXValue,.cgPoint,&actual), AXValueGetValue(dimensions as! AXValue,.cgSize,&actualSize), bounds.contains(CGPoint(x:actual.x+actualSize.width/2,y:actual.y+actualSize.height/2)) {
                diagnostic("AX position=\(actual) size=\(actualSize)")
                let windows=CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [[String:Any]] ?? []
                let own=windows.filter { ($0[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == process.processIdentifier }
                diagnostic("Visible windows=\(own.map { ["bounds":$0[kCGWindowBounds as String] ?? "?","layer":$0[kCGWindowLayer as String] ?? "?"] })")
                moved=own.contains { info in
                    guard (info[kCGWindowLayer as String] as? NSNumber)?.intValue == 0, let rect=info[kCGWindowBounds as String] as? NSDictionary,let frame=CGRect(dictionaryRepresentation:rect) else { return false }
                    return frame.width>500 && frame.height>300 && bounds.contains(CGPoint(x:frame.midX,y:frame.midY))
                }
                if moved { break }
            }
        }
    } while Date()<end
    guard moved else { fail("Reolink opened but macOS would not move its window to Office") }
    process.activate()
    print("Reolink opened on Office extended display")
} else { original?.activate() }
