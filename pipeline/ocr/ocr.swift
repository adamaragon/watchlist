import Foundation
import Vision
import AppKit

// usage: ocr <outDir> <img1> [img2 ...]
let args = CommandLine.arguments
guard args.count >= 3 else { FileHandle.standardError.write("usage: ocr <outDir> <img...>\n".data(using:.utf8)!); exit(2) }
let outDir = args[1]
try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

func ocr(path: String) -> String {
    guard let img = NSImage(contentsOfFile: path),
          let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return "" }
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.usesLanguageCorrection = true
    let handler = VNImageRequestHandler(cgImage: cg, options: [:])
    try? handler.perform([req])
    let obs = (req.results ?? []) as [VNRecognizedTextObservation]
    return obs.compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
}

for path in args.dropFirst(2) {
    let base = (path as NSString).lastPathComponent
    let stem = (base as NSString).deletingPathExtension
    let text = ocr(path: path)
    let url = URL(fileURLWithPath: outDir).appendingPathComponent("\(stem).txt")
    try? text.write(to: url, atomically: true, encoding: .utf8)
    print("\(base): \(text.count) chars")
}
