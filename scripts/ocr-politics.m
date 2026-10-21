#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>
#import <PDFKit/PDFKit.h>
#import <Vision/Vision.h>

// Local-only Apple Vision OCR with one JSON checkpoint per PDF page.
int main(int argc, const char *argv[]) {
  @autoreleasepool {
    if (argc < 5) { fprintf(stderr, "Usage: ocr-politics input.pdf output-directory first-page last-page [width]\n"); return 2; }
    NSString *input = [NSString stringWithUTF8String:argv[1]];
    NSString *output = [NSString stringWithUTF8String:argv[2]];
    NSInteger first = atoi(argv[3]), last = atoi(argv[4]);
    CGFloat width = argc > 5 ? atof(argv[5]) : 1700;
    NSError *error = nil;
    if (![[NSFileManager defaultManager] createDirectoryAtPath:output withIntermediateDirectories:YES attributes:nil error:&error]) {
      fprintf(stderr, "%s\n", error.description.UTF8String); return 1;
    }
    PDFDocument *document = [[PDFDocument alloc] initWithURL:[NSURL fileURLWithPath:input]];
    if (!document || first < 1 || first > document.pageCount) return 2;
    fprintf(stdout, "OCR %s: %ld pages; range %ld...%ld\n", input.lastPathComponent.UTF8String, document.pageCount, first, MIN(last, document.pageCount)); fflush(stdout);
    for (NSInteger number = first; number <= MIN(last, document.pageCount); number++) {
      @autoreleasepool {
        NSString *destination = [output stringByAppendingPathComponent:[NSString stringWithFormat:@"page-%04ld.json", number]];
        if ([[NSFileManager defaultManager] fileExistsAtPath:destination]) continue;
        PDFPage *page = [document pageAtIndex:number - 1];
        NSRect bounds = [page boundsForBox:kPDFDisplayBoxMediaBox];
        NSImage *image = [page thumbnailOfSize:NSMakeSize(width, width * bounds.size.height / bounds.size.width) forBox:kPDFDisplayBoxMediaBox];
        CGImageRef bitmap = [image CGImageForProposedRect:NULL context:nil hints:nil];
        if (!bitmap) return 3;
        VNRecognizeTextRequest *request = [[VNRecognizeTextRequest alloc] init];
        request.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
        request.recognitionLanguages = @[@"zh-Hans", @"en-US"];
        request.usesLanguageCorrection = YES;
        request.minimumTextHeight = 0.004;
        VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:bitmap options:@{}];
        if (![handler performRequests:@[request] error:&error]) {
          fprintf(stderr, "Page %ld: %s\n", number, error.description.UTF8String); return 4;
        }
        NSMutableArray *rows = [NSMutableArray array];
        for (VNRecognizedTextObservation *observation in request.results) {
          VNRecognizedText *candidate = [[observation topCandidates:1] firstObject];
          if (!candidate) continue;
          CGRect box = observation.boundingBox;
          [rows addObject:@{@"text":candidate.string, @"confidence":@(candidate.confidence), @"x":@(box.origin.x), @"y":@(box.origin.y), @"width":@(box.size.width), @"height":@(box.size.height)}];
        }
        [rows sortUsingComparator:^NSComparisonResult(NSDictionary *a, NSDictionary *b) {
          double dy = [a[@"y"] doubleValue] - [b[@"y"] doubleValue];
          if (fabs(dy) > 0.006) return dy > 0 ? NSOrderedAscending : NSOrderedDescending;
          return [a[@"x"] compare:b[@"x"]];
        }];
        NSString *text = [[rows valueForKey:@"text"] componentsJoinedByString:@"\n"];
        NSDictionary *payload = @{@"pdfPage":@(number), @"engine":@"Apple Vision", @"status":@"ok", @"width":@(CGImageGetWidth(bitmap)), @"height":@(CGImageGetHeight(bitmap)), @"lines":rows, @"text":text};
        NSData *json = [NSJSONSerialization dataWithJSONObject:payload options:NSJSONWritingPrettyPrinted|NSJSONWritingSortedKeys|NSJSONWritingWithoutEscapingSlashes error:&error];
        if (!json || ![json writeToFile:destination options:NSDataWritingAtomic error:&error]) {
          fprintf(stderr, "Cannot save page %ld: %s\n", number, error.description.UTF8String); return 5;
        }
        fprintf(stdout, "page %ld: %lu lines\n", number, (unsigned long)rows.count); fflush(stdout);
      }
    }
  }
  return 0;
}
