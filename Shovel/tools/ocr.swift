// Local text recognition for photos and scanned PDFs (Apple Vision, runs on this Mac, nothing leaves it).
// Usage: ocr <image|pdf> [--png <dir>]   -> JSON { pages: [{w,h}], lines: [{page,text,x,y,w,h,conf}] } on stdout
// Coordinates are normalised (0..1), origin bottom-left, as Vision returns them.
import Foundation
import Vision
import ImageIO
import CoreGraphics
import UniformTypeIdentifiers
import CoreImage

struct Line: Codable { let page: Int; let text: String; let x: Double; let y: Double; let w: Double; let h: Double; let conf: Float; let angle: Double }
struct Page: Codable { let w: Int; let h: Int }
struct Out: Codable { var pages: [Page] = []; var lines: [Line] = [] }

func images(_ url: URL) -> [CGImage] {
  if url.pathExtension.lowercased() == "pdf" {
    guard let doc = CGPDFDocument(url as CFURL), doc.numberOfPages > 0 else { return [] }
    var out: [CGImage] = []
    for i in 1...doc.numberOfPages {
      guard let page = doc.page(at: i) else { continue }
      let box = page.getBoxRect(.mediaBox)
      let s: CGFloat = 2.5
      let w = Int(box.width * s), h = Int(box.height * s)
      guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { continue }
      ctx.setFillColor(CGColor(gray: 1, alpha: 1))
      ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
      ctx.scaleBy(x: s, y: s)
      ctx.translateBy(x: -box.minX, y: -box.minY)
      ctx.drawPDFPage(page)
      if let img = ctx.makeImage() { out.append(img) }
    }
    return out
  }
  guard let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { return [] }
  // applies the camera's EXIF orientation, caps the size
  let opts: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true,
                               kCGImageSourceCreateThumbnailWithTransform: true,
                               kCGImageSourceThumbnailMaxPixelSize: 4200]
  if let img = CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary) { return [img] }
  return []
}

// Photos: find the page outline and flatten it (perspective correction) before reading.
func flatten(_ img: CGImage) -> CGImage {
  let req = VNDetectDocumentSegmentationRequest()
  try? VNImageRequestHandler(cgImage: img, options: [:]).perform([req])
  guard let r = req.results?.first, r.confidence > 0.6 else { return img }
  let W = CGFloat(img.width), H = CGFloat(img.height)
  let xs = [r.topLeft.x, r.topRight.x, r.bottomLeft.x, r.bottomRight.x], ys = [r.topLeft.y, r.topRight.y, r.bottomLeft.y, r.bottomRight.y]
  let area = (xs.max()! - xs.min()!) * (ys.max()! - ys.min()!)
  guard area > 0.25 && area < 0.97 else { return img } // no clear page outline, or the page already fills the image
  let f = CIFilter(name: "CIPerspectiveCorrection")!
  f.setValue(CIImage(cgImage: img), forKey: kCIInputImageKey)
  f.setValue(CIVector(x: r.topLeft.x * W, y: r.topLeft.y * H), forKey: "inputTopLeft")
  f.setValue(CIVector(x: r.topRight.x * W, y: r.topRight.y * H), forKey: "inputTopRight")
  f.setValue(CIVector(x: r.bottomLeft.x * W, y: r.bottomLeft.y * H), forKey: "inputBottomLeft")
  f.setValue(CIVector(x: r.bottomRight.x * W, y: r.bottomRight.y * H), forKey: "inputBottomRight")
  guard let out = f.outputImage, let cg = CIContext().createCGImage(out, from: out.extent) else { return img }
  return cg
}

let args = CommandLine.arguments
guard args.count >= 2 else { FileHandle.standardError.write("usage: ocr <file> [--png dir]\n".data(using: .utf8)!); exit(2) }
let url = URL(fileURLWithPath: args[1])
let pngDir: String? = args.count >= 4 && args[2] == "--png" ? args[3] : nil
var out = Out()
let isPdf = url.pathExtension.lowercased() == "pdf"
for (i, raw) in images(url).enumerated() {
  let img = isPdf ? raw : flatten(raw)
  out.pages.append(Page(w: img.width, h: img.height))
  if let dir = pngDir, let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: "\(dir)/page-\(i + 1).png") as CFURL, UTType.png.identifier as CFString, 1, nil) {
    CGImageDestinationAddImage(dest, img, nil); CGImageDestinationFinalize(dest)
  }
  let req = VNRecognizeTextRequest()
  req.recognitionLevel = .accurate
  req.usesLanguageCorrection = false // keep numbers and item numbers as printed
  req.recognitionLanguages = ["de-DE", "en-US"]
  try? VNImageRequestHandler(cgImage: img, options: [:]).perform([req])
  for o in req.results ?? [] {
    guard let c = o.topCandidates(1).first else { continue }
    let b = o.boundingBox
    // tilt of this text line in degrees, measured in pixels
    let dx = Double(o.topRight.x - o.topLeft.x) * Double(img.width), dy = Double(o.topRight.y - o.topLeft.y) * Double(img.height)
    let angle = atan2(dy, dx) * 180 / Double.pi
    out.lines.append(Line(page: i + 1, text: c.string, x: b.minX, y: b.minY, w: b.width, h: b.height, conf: c.confidence, angle: angle))
  }
}
FileHandle.standardOutput.write(try! JSONEncoder().encode(out))
