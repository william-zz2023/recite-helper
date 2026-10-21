"""Assemble complete, page-addressable OCR text and website data. No semantic rewriting."""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "tmp/pdfs/politics-ocr"
TEXT = ROOT / "output/text"
DATA = ROOT / "data/politics"
BOOKS = [
    {"id": "upper", "volume": "上册", "pages": 238, "offset": 7,
     "source": "/Users/apple/Downloads/27肖秀荣-背诵手册【上册】.pdf",
     "parts": ["马克思主义基本原理", "毛泽东思想和中国特色社会主义理论体系概论", "习近平新时代中国特色社会主义思想概论", "中国近现代史纲要", "思想道德与法治"]},
    {"id": "lower", "volume": "下册", "pages": 168, "offset": 6,
     "source": "/Users/apple/Downloads/27肖秀荣-背诵手册【下册】.pdf",
     "parts": ["特别专题", "习题190", "分析题必背专题", "经典干扰项总结", "234速查", "学科总结"]},
]
NUMERALS = "一二三四五六七八九十"

def clean_lines(lines):
    kept, removed = [], []
    for line in lines:
        text = line["text"].strip()
        compact = re.sub(r"\s+", "", text)
        reason = None
        if "618427351" in compact and ("群" in compact or "更新" in compact):
            reason = "重复群号水印"
        elif (line["y"] > .9 or line["y"] < .045) and re.fullmatch(r"[0-9IVXLCDM]+", compact):
            reason = "页眉页脚页码"
        elif line["y"] > .9 and re.fullmatch(r"2027考研政治背诵手册", compact):
            reason = "重复书名页眉"
        elif line["y"] > .9 and re.match(r"^第[一二三四五六]部分", compact):
            reason = "重复分部页眉"
        if reason:
            removed.append({"text": text, "reason": reason})
        elif text:
            kept.append({**line, "text": text})
    return kept, removed

def assemble(book):
    cached = []
    for page in range(1, book["pages"] + 1):
        file = CACHE / book["id"] / f"page-{page:04}.json"
        if not file.exists():
            raise SystemExit(f"Incomplete OCR: {book['id']} page {page}; no final files written")
        item = json.loads(file.read_text())
        if item.get("pdfPage") != page or item.get("status") != "ok":
            raise SystemExit(f"Invalid OCR checkpoint: {file}")
        cached.append(item)
    sections = []
    for item in cached:
        if item["pdfPage"] <= book["offset"]:
            continue
        for line in item["lines"]:
            compact = re.sub(r"\s+", "", line["text"])
            match = re.match(r"^第([一二三四五六])部分", compact)
            divider = bool(match and re.fullmatch(r"第([一二三四五六])部分", compact) and .15 < line["y"] < .85)
            if match and (divider or line["y"] > .9):
                number = NUMERALS.index(match[1]) + 1
                if number <= len(book["parts"]) and not any(s["number"] == number for s in sections):
                    sections.append({"number": number, "title": book["parts"][number - 1], "pdfPage": item["pdfPage"],
                                     "isDivider": divider, "startPage": item["pdfPage"] + int(divider)})
    sections.sort(key=lambda s: s["pdfPage"])
    if [s["number"] for s in sections] != list(range(1, len(book["parts"]) + 1)):
        raise SystemExit(f"Review part boundaries before publishing: {book['id']}: {sections}")
    pages, removals = [], []
    raw_text = []
    for item in cached:
        number = item["pdfPage"]
        raw_text.append(f"===== PDF 第 {number} 页 =====\n{item['text']}\n")
        lines, removed = clean_lines(item["lines"])
        text = "\n".join(line["text"] for line in lines)
        active = [s for s in sections if s["pdfPage"] <= number]
        section = active[-1]["title"] if active else "封面与目录"
        printed = [int(line["text"].strip()) for line in item["lines"]
                   if line["y"] > .9 and (line["x"] < .15 or line["x"] > .8)
                   and re.fullmatch(r"[0-9]{1,3}", line["text"].strip())]
        book_page = printed[0] if len(printed) == 1 and number > book["offset"] else None
        confidences = [line["confidence"] for line in lines]
        suspicious = sum(c < .35 for c in confidences)
        parallel_rows = sum(1 for i, line in enumerate(lines) for other in lines[i + 1:]
                            if abs(line["y"] - other["y"]) < .008
                            and abs(line["x"] - other["x"]) > .15)
        is_divider = any(s["isDivider"] and s["pdfPage"] == number for s in sections)
        sparse = bool(number > book["offset"] and not is_divider and len(text) < 40)
        pages.append({"pdfPage": number, "bookPage": book_page, "section": section,
                      "title": next((line["text"] for line in lines if len(line["text"]) >= 3), f"PDF 第 {number} 页")[:70],
                      "text": text, "confidence": round(sum(confidences) / len(confidences), 4) if confidences else 0,
                      "needsReview": sparse or bool(confidences and suspicious / len(confidences) > .2), "lowConfidenceLines": suspicious,
                      "multiColumn": parallel_rows >= 4})
        removals.extend({"pdfPage": number, **row} for row in removed)
    last_content_page = max(page["pdfPage"] for page in pages if page["bookPage"] is not None)
    divider_pages = {section["pdfPage"] for section in sections if section["isDivider"]}
    for page in pages:
        page["isStudyContent"] = sections[0]["startPage"] <= page["pdfPage"] <= last_content_page and page["pdfPage"] not in divider_pages
        if page["pdfPage"] > last_content_page:
            page["section"] = "出版信息与附页"
    source = Path(book["source"])
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    name = f"27肖秀荣-背诵手册【{book['volume']}】.txt"
    title = f"2027 考研政治背诵手册 · {book['volume']}"
    intro = (f"{title}\n来源：{source.name}\n识别方式：本机 Apple Vision OCR\n"
             "说明：以下为扫描件识别文本，未逐字校对；公式、表格、框架图和个别字词可能有误，请与原 PDF 核对。\n"
             "整理范围：仅移除重复群号水印、重复页眉和边缘页码；保留正文用词和识别行序，不补写或改写知识点。\n"
             "页码规则：PDF 页码从文件第 1 页开始；原书页码另列，两者不同。\n\n")
    body = []
    for page in pages:
        label = f"原书第 {page['bookPage']} 页" if page["bookPage"] is not None else ("封面与目录" if page["section"] == "封面与目录" else "原书页码未标注或未识别")
        body.append(f"===== PDF 第 {page['pdfPage']} 页 / {label} =====\n{page['text']}\n")
    return {
        "book": {"schemaVersion": 1, "id": book["id"], "title": title, "volume": book["volume"],
                 "sourceFile": source.name, "sourceSha256": digest, "engine": "Apple Vision", "ocrUnreviewed": True,
                 "pdfPageCount": book["pages"], "firstContentPage": sections[0]["startPage"], "lastContentPage": last_content_page,
                 "sections": sections, "pages": pages},
        "filename": name, "text": intro + "\n".join(body), "rawText": "\n".join(raw_text),
        "audit": {"id": book["id"], "sourceFile": source.name, "sourceSha256": digest,
                  "pdfPages": len(pages), "characters": sum(len(p["text"]) for p in pages),
                  "pagesToReview": [p["pdfPage"] for p in pages if p["needsReview"]],
                  "lowConfidenceLines": sum(p["lowConfidenceLines"] for p in pages),
                  "removedLines": removals, "sections": sections},
    }

def main():
    results = [assemble(book) for book in BOOKS]
    TEXT.mkdir(parents=True, exist_ok=True)
    DATA.mkdir(parents=True, exist_ok=True)
    catalog = []
    for result in results:
        book = result["book"]
        (TEXT / result["filename"]).write_text(result["text"])
        (CACHE / f"{book['id']}-raw.txt").write_text(result["rawText"])
        (DATA / f"{book['id']}.json").write_text(json.dumps(book, ensure_ascii=False, indent=2) + "\n")
        catalog.append({key: book[key] for key in ["id", "title", "volume", "pdfPageCount", "firstContentPage"]}
                       | {"dataFile": f"{book['id']}.json", "readerFile": f"{book['id']}-reader.json", "textFile": f"../../output/text/{result['filename']}"})
    (DATA / "catalog.json").write_text(json.dumps({"schemaVersion": 1, "books": catalog}, ensure_ascii=False, indent=2) + "\n")
    (TEXT / "OCR解析报告.json").write_text(json.dumps({"engine": "Apple Vision", "fullyProofread": False, "books": [r["audit"] for r in results]}, ensure_ascii=False, indent=2) + "\n")
    summary = ["# 政治手册 OCR 解析说明", "", "两册均为扫描件正文，使用本机 Apple Vision 简体中文与英文识别；没有上传第三方 OCR 服务。", "",
           "此版本未逐字校对。引擎置信度不是正确率，纯文本不能完整保留表格、公式、框架图和多列选项的版式。", "",
           "## 输出范围", "", "| 分册 | PDF 页数 | 识别文本字符数 | 自动提示需复核的页数 |", "|---|---:|---:|---:|"]
    for result in results:
        audit = result["audit"]
        summary.append(f"| {result['book']['volume']} | {audit['pdfPages']} | {audit['characters']} | {len(audit['pagesToReview'])} |")
    summary.extend(["", "PDF 页码按文件从 1 起算。原书页码读取页面边缘的印刷页码；未识别时留空，不采用固定偏移推算。", "",
                "上册 PDF 第 200、201 页识别到的原书页码为 193、195；第五部分从 PDF 第 201 页直接进入正文。网站按提供文件实际顺序展示，不补写未提供的页面。", "",
                "## 抽样与限制", "", "已将上册 PDF 第 8、9、201 页和下册第 18 页渲染为图片抽查。普通段落、目录与选择题能识别；表格单元格的阅读顺序及个别字符、符号存在误识别。", "",
                "只删除重复群号水印、重复书名或分部页眉、边缘数字页码。不根据上下文补写理论表述，不把扫描表格伪装成已校对的结构化题库。", "",
                "自动提示需复核的页码见 OCR解析报告.json。这些提示只用于排查，不表示其他页面已经人工确认。", "",
                "逐页原始识别结果、坐标和未清理文本位于 tmp/pdfs/politics-ocr/，没有加入 Git 跟踪。源 PDF 保持原位置和原文件，没有复制进网站。", "",
                "网站使用 data/politics/ 下的逐页 JSON；纯文本位于本目录。它们都来自同一份识别结果。", ""])
    (TEXT / "解析说明.md").write_text("\n".join(summary))
    print(json.dumps([{key: r["audit"][key] for key in ["id", "pdfPages", "characters", "sections"]} | {"reviewPageCount": len(r["audit"]["pagesToReview"])} for r in results], ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
