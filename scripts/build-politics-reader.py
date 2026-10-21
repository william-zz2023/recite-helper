"""Build a source-addressable, continuous reading edition from local OCR checkpoints.

This changes structure, never supplies missing textbook content. Keep the page edition
and TXT intact for comparison. Run after build-politics-text.py.
"""
from pathlib import Path
from collections import Counter
import importlib.util
import json
import re

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data/politics'
CACHE = ROOT / 'tmp/pdfs/politics-ocr'
spec = importlib.util.spec_from_file_location('ocr_text', ROOT / 'scripts/build-politics-text.py')
ocr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ocr)
CN = '一二三四五六七八九十百零〇'
TOPIC = re.compile(rf'^(?:特别)?专题[{CN}0-9]+$')
CHINESE = re.compile(rf'^[{CN}]+[、．.]')
SUB = re.compile(rf'^[（(][{CN}]+[）)]')
NUMBER = re.compile(r'^(\d{1,3})[.．、]\s*(.*)$')
POINT = re.compile(r'^(?:[①-⑳❶-❿]|[•·●◎]|[（(]\d+[）)]|[A-D][.．、]|>\s*)')


def compact(s):
    return re.sub(r'\s+', '', s)


def join(parts):
    out = ''
    for part in parts:
        text = part.strip()
        if out and text and re.search(r'[A-Za-z]$', out) and re.match(r'[A-Za-z]', text):
            out += ' '
        out += text
    return out


def pages(lines):
    return sorted({line['page'] for line in lines})


def table(caption, rows, source_pages):
    return {'type': 'table', 'caption': caption, 'rows': rows, 'sourcePages': source_pages}


def opening_tables():
    # Read against the scan. Retain the full entries rather than the abbreviated mockup.
    return [
        table('马克思主义产生的社会根源、阶级基础和思想渊源', [
            ['社会根源', '资本主义经济的发展（经济、社会历史条件）'],
            ['阶级基础', '无产阶级在反抗资产阶级剥削和压迫的斗争中逐步走向自觉，并迫切渴望科学的理论指导'],
            ['思想渊源 · 直接理论来源', '德国古典哲学、英国古典政治经济学、英法空想社会主义（19世纪西欧三大先进思潮）'],
            ['思想渊源 · 自然科学前提', '19世纪三大科学发现（细胞学说、能量守恒与转化定律、生物进化论）'],
        ], [9]),
        table('马克思、恩格斯的重要著作（按时间排序）', [
            ['马克思主义创立时期', ''],
            ['马克思、恩格斯发表在《德法年鉴》上的论文', '表明他们完成了从唯心主义向唯物主义、从革命民主主义向共产主义的转变，为创立马克思主义奠定了思想前提'],
            ['《神圣家族》', '马克思、恩格斯合著的第一部著作'],
            ['《关于费尔巴哈的提纲》', '包含着新世界观的天才萌芽的第一个文件，文件系统论述了实践的观点，揭示了科学实践观的基本内容'],
            ['《德意志意识形态》', '首次系统阐述了历史唯物主义的基本观点，实现了历史观上的伟大变革'],
            ['《共产党宣言》', '标志着马克思主义的公开问世'],
            ['马克思主义公开问世后', ''],
            ['《资本论》', '系统阐述了剩余价值学说，揭示了资本主义生产关系的秘密。被称为“工人阶级的圣经”'],
            ['《法兰西内战》', '科学总结了巴黎公社的历史经验'],
            ['《哥达纲领批判》', '对未来社会从制度、发展阶段以及分配等方面作了原则构想，进一步丰富了科学社会主义学说'],
            ['《反杜林论》', '全面阐述了马克思主义理论体系'],
            ['马克思逝世后', ''],
            ['《家庭、私有制和国家的起源》《路德维希·费尔巴哈和德国古典哲学的终结》等著作', '恩格斯进一步发展了马克思主义理论'],
        ], [9, 10]),
    ]


def rows_in_order(lines):
    """Order same-baseline cells left to right, including two-column MCQ options."""
    rows = []
    for line in lines:
        row = next((r for r in rows[-3:] if abs(r[0]['y'] - line['y']) < .010 and r[0]['page'] == line['page']), None)
        if row is None:
            rows.append([line])
        else:
            row.append(line)
    return [line for row in rows for line in sorted(row, key=lambda x: x['x'])]


def restore_simple_tables(lines):
    """Propose cells only on scan-reviewed pages; apply corrections below.

    Never infer label/value relationships on unreviewed multi-column pages.
    """
    tokens, run = [], []

    def flush():
        if not run:
            return
        if run[0]['page'] not in {122, 133, 152, 167, 207, 208}:
            tokens.extend(run); run.clear(); return
        left = [x for x in run if x['x'] < .28 and x['width'] < .31]
        right = [x for x in run if x['x'] >= .28]
        other = [x for x in run if x not in left and x not in right]
        edges = Counter(round(x['x'] / .04) for x in right)
        if len(left) < 3 or len(right) < 3 or other or not edges or max(edges.values()) / len(right) < .7:
            tokens.extend(run); run.clear(); return
        groups = []
        for line in left:
            if groups and groups[-1][-1]['y'] - line['y'] < .033:
                groups[-1].append(line)
            else:
                groups.append([line])
        if len(groups) < 2:
            tokens.extend(run); run.clear(); return
        centers = [sum(x['y'] + x['height']/2 for x in group) / len(group) for group in groups]
        cells = [[] for _ in groups]
        for line in right:
            row = min(range(len(groups)), key=lambda i: abs(line['y'] + line['height']/2 - centers[i]))
            cells[row].append(line)
        if any(not cell for cell in cells):
            tokens.extend(run); run.clear(); return
        tokens.append({'table': table('', [[join([x['text'] for x in group]), join([x['text'] for x in cell])]
                                         for group, cell in zip(groups, cells)], pages(run))})
        run.clear()

    for line in lines:
        structured = CHINESE.match(line['text']) or SUB.match(line['text']) or NUMBER.match(line['text']) or (POINT.match(line['text']) and line['x'] < .2)
        if line['width'] > .63 or structured or (run and line['page'] != run[-1]['page']):
            flush(); tokens.append(line)
        else:
            run.append(line)
    flush()
    return tokens


def reflow_panels(lines):
    """Independent conference panels are read in panels, not interleaved scan rows."""
    result = []
    for page in pages(lines):
        page_lines = [x for x in lines if x['page'] == page]
        anchors = [x for x in page_lines if re.fullmatch(rf'中共[{CN}]+大|中共[{CN}]+届[{CN}]+中全会|[{CN}]+届[{CN}]+中全会|八七会议|遵义会议', compact(x['text']))]
        if len(anchors) < 2:
            result.extend(page_lines); continue
        panels = {x['uid']: [dict(x, forceHeading=True)] for x in anchors}
        prefix = []
        for line in page_lines:
            if line in anchors:
                continue
            candidates = [x for x in anchors if (x['x'] < .5) == (line['x'] < .5) and x['y'] + .012 >= line['y']]
            if candidates:
                anchor = min(candidates, key=lambda x: x['y'] - line['y'])
                panels[anchor['uid']].append(line)
            else:
                prefix.append(line)
        result.extend(prefix)
        for anchor in sorted(anchors, key=lambda x: (-round(x['y']/.025), x['x'])):
            result.extend(panels[anchor['uid']])
    return result


def layout_blocks(lines, diagram=False):
    result = []
    paragraph = []

    def flush():
        if paragraph:
            result.append({'type': paragraph[0].get('kind', 'paragraph'),
                           'text': join([x['text'] for x in paragraph]), 'sourcePages': pages(paragraph)})
            paragraph.clear()

    ordered = rows_in_order(lines)
    if diagram:
        ordered = reflow_panels(ordered)
    for line in ordered if diagram else restore_simple_tables(ordered):
        if 'table' in line:
            flush(); result.append(line['table']); continue
        text = line['text']
        if text in ['续表', '••', '•-', '…']:
            continue
        is_point = bool(POINT.match(text) or (re.match(r'^[1-9]\s+|^。\s*', text) and line['x'] < .2))
        is_head = bool(CHINESE.match(text) or SUB.match(text) or line.get('forceHeading'))
        is_note = bool(re.match(r'^[-—]*[【\[]?(?:命题分析|注意|辨析|拓展|易错)', text))
        is_option = bool(re.match(r'^[A-D][.．、]', text))
        new = is_head or is_point or is_note or bool(NUMBER.match(text))
        if paragraph:
            previous = paragraph[-1]
            terminal = bool(re.search(r'[。！？；：]$', previous['text']))
            # Chinese hard wraps are not paragraph boundaries. Across pages the
            # same rule applies, so split words/sentences join without a page gap.
            indented = previous['page'] == line['page'] and line['x'] - previous['x'] > .025
            if new or re.search(r'[。！？]$', previous['text']) or (terminal and (indented or previous['page'] != line['page'])):
                flush()
            elif diagram and abs(previous['x'] - line['x']) > .15:
                flush()
        if is_head:
            flush()
            result.append({'type': 'heading', 'text': text, 'sourcePages': [line['page']]})
        else:
            if not paragraph:
                line = {**line, 'kind': 'option' if is_option else 'note' if is_note else 'point' if is_point else 'paragraph'}
            paragraph.append(line)
    flush()
    # A short, colon-ended phrase is a useful subheading without inventing a title.
    for block in result:
        if block['type'] == 'paragraph' and len(block['text']) <= 32 and block['text'].endswith('：'):
            block['type'] = 'heading'
    return result


def reviewed_table_layout(blocks):
    result = []
    for block in blocks:
        if block['type'] != 'table':
            result.append(block); continue
        source = block['sourcePages']
        if source == [133]:
            last = block['rows'].pop()
            if last[0].startswith('（记忆法'):
                block['rows'][-1][1] += last[1]
                result.append(block)
                result.append({'type': 'note', 'text': last[0], 'sourcePages': source})
                continue
        if source == [152]:
            block = table('近代以来中国签订的部分不平等条约', [
                ['1842年 · 中英《南京条约》', '① 割让香港岛，五口通商，开始丧失关税自主权、领土主权、领海主权；\n② 中国开始成为半殖民地半封建社会的标志'],
                ['1843年 · 中英《五口通商章程》', '帝国主义开始在华取得领事裁判权'],
                ['1843年 · 中英《虎门条约》', '① 开外国人在中国不受中国法律管束的先例，中国丧失司法主权；\n② 片面最惠国待遇；\n③ 租赁土地，永久居住，后变为设租界'],
                ['1858年 · 《天津条约》', '外国公使常驻北京，逐渐控制中国的内政外交'],
                ['1895年 · 中日《马关条约》', '① 割让辽东半岛、台湾岛及所有附属岛屿、澎湖列岛；\n② 允许外国人在中国投资办厂，商品输出向资本输出的转变；\n③ 帝国主义列强掀起瓜分中国的狂潮；\n④ 中国人民的民族意识开始普遍觉醒'],
                ['1901年 · 《辛丑条约》', '① 赔款最多；\n② 获得在中国领土上驻军的特权；\n③ 中国完全成为半殖民地半封建社会'],
            ], source)
        if source == [167]:
            block = table('中国近代史上的思想启蒙和思想解放运动', [
                ['郑观应《盛世危言》', '大力发展民族工商业，同西方国家进行“商战”，设立议院，实行“君民共主”制度等主张具有重要的思想启蒙的意义'],
                ['戊戌维新运动', '一场思想启蒙运动'],
                ['辛亥革命', '推动了中国人民的思想解放'],
                ['五四以前的新文化运动', '在中国社会上掀起了一股思想解放的潮流'],
                ['五四运动', '一场传播新思想新文化新知识的伟大思想启蒙运动和新文化运动'],
                ['延安整风运动', '一次深刻的马克思主义思想教育运动，也是一场思想解放运动'],
                ['真理标准大讨论', '一场深刻而广泛的马克思主义思想解放运动'],
            ], source)
        if source == [207]:
            block = table('中华民族崇尚精神的优秀传统 · 名言名句', [
                ['对物质生活与精神生活相互关系的独到理解（重精神）', '“不义而富且贵，于我如浮云”\n“道德当身，故不以物惑”\n“一箪食，一瓢饮，在陋巷，人不堪其忧，回也不改其乐”\n见利思义、以义制利、先义后利'],
                ['对理想的不懈追求（重理想）', '“志士仁人，无求生以害仁，有杀身以成仁”\n“兼相爱，交相利”\n“为天地立心，为生民立命，为往圣继绝学，为万世开太平”'],
                ['对品格养成的重视（重道德、重人格）', '“立德”置于“三不朽”（立德、立功、立言）之首\n“自天子以至于庶人，壹是皆以修身为本”'],
            ], [207, 208])
        if source == [208]:
            continue
        result.append(block)
    return result


def assemble(bid):
    book = json.loads((DATA / f'{bid}.json').read_text())
    topics, current, unit = [], None, None
    section_index = 0
    topic_counts = Counter()
    accepted, assigned = set(), set()
    ignored = []
    question_mode = ''

    def start_topic(title, label='', sources=None):
        nonlocal current, unit
        topic_counts[section_index] += 1
        current = {'id': f'{bid}-s{section_index}-t{topic_counts[section_index]}',
                   'section': book['sections'][section_index - 1]['title'], 'sectionNumber': section_index,
                   'title': title, 'label': label, 'items': [], 'sourcePages': sources or []}
        topics.append(current)
        unit = None

    def start_unit(title, number='', sources=None):
        nonlocal unit
        if current is None:
            start_topic(book['sections'][section_index - 1]['title'])
        unit = {'id': f'{current["id"]}-q{len(current["items"]) + 1}', 'title': title,
                'number': number, '_lines': [], 'sourcePages': sources or []}
        current['items'].append(unit)

    for page in book['pages']:
        if not page['isStudyContent']:
            continue
        number = page['pdfPage']
        index = max(s['number'] for s in book['sections'] if s['startPage'] <= number)
        if index != section_index:
            section_index, current, unit = index, None, None
        if bid == 'lower' and number == 145:
            # The supplied scan has no recognized 十 heading; use a descriptive
            # reader index rather than attach these panels to the preceding 不 list.
            start_topic('重要会议', sources=[number])
        raw = json.loads((CACHE / bid / f'page-{number:04}.json').read_text())
        clean, _ = ocr.clean_lines(raw['lines'])
        lines = []
        for i, line in enumerate(clean):
            uid = f'{number}:{i}'
            if line['y'] > .89 and compact(line['text']) == compact(page['section']):
                ignored.append(uid)
                continue
            lines.append({**line, 'page': number, 'uid': uid})
            accepted.add(uid)
        # Topic labels and their adjacent title can be in either OCR line order.
        topic_at, title_ids = {}, set()
        for line in lines:
            if TOPIC.fullmatch(compact(line['text'])):
                siblings = [x for x in lines if x['uid'] != line['uid'] and x['x'] > line['x'] + .1
                            and abs((x['y'] + x['height']/2) - (line['y'] + line['height']/2)) < .035
                            and x['height'] > .018]
                siblings.sort(key=lambda x: -x['y'])
                related = siblings + [line]
                first = min(lines.index(x) for x in related)
                topic_at[first] = (join([x['text'] for x in siblings]) or line['text'], line['text'], related)
                title_ids.update(x['uid'] for x in related)
        i = 0
        while i < len(lines):
            line = lines[i]
            text = line['text']
            if i in topic_at:
                title, label, related = topic_at[i]
                start_topic(title, label, [number])
                assigned.update(x['uid'] for x in related)
            if line['uid'] in title_ids:
                i += 1
                continue
            # Lower-volume sections use subject headings instead of 专题 labels.
            lower_subject = bid == 'lower' and section_index in [3, 4, 5, 6] and bool(CHINESE.match(text))
            mcq_group = bid == 'lower' and section_index == 2 and bool(SUB.match(text) or CHINESE.match(text))
            if lower_subject or mcq_group:
                heading_lines = [line]
                if i + 1 < len(lines) and len(text) > 24 and lines[i+1]['y'] < line['y'] and not POINT.match(lines[i+1]['text']) and not NUMBER.match(lines[i+1]['text']) and not CHINESE.match(lines[i+1]['text']):
                    # Only join a visually aligned continuation of a long heading.
                    if abs(lines[i+1]['x'] - line['x']) < .025 and line['y'] - lines[i+1]['y'] < .033:
                        heading_lines.append(lines[i+1]); i += 1
                heading = join([x['text'] for x in heading_lines])
                if mcq_group:
                    question_mode = heading
                start_topic(heading, sources=[number])
                assigned.update(x['uid'] for x in heading_lines)
                i += 1
                continue
            if current is None:
                start_topic(page['section'], sources=[number])
            match = NUMBER.match(text)
            chinese_question = bool(CHINESE.match(text)) and (bid == 'upper' or section_index == 1)
            sub_question = bid == 'lower' and section_index == 3 and bool(SUB.match(text))
            trap = bid == 'lower' and section_index == 4 and re.match(r'^干扰项\s*\d+', text)
            quick = bid == 'lower' and section_index == 5 and re.match(r'^[（(]\d+[）)]', text)
            numeric_question = bool(match) and ((bid == 'upper' and line['x'] < .16) or (bid == 'lower' and section_index == 2 and line['x'] < .17))
            if numeric_question or chinese_question or sub_question or trap or quick:
                number_label = match[1] if numeric_question else ''
                title = match[2] if numeric_question else text
                title_lines = [line]
                # A detached numeral and title are often on the same visual row.
                if numeric_question and not title and i + 1 < len(lines):
                    i += 1; title_lines.append(lines[i]); title = lines[i]['text']
                if trap and i + 1 < len(lines):
                    i += 1; title_lines.append(lines[i]); title = f'{text.rstrip("）)")} · {lines[i]["text"]}'
                # Multi-line title headings wrap at the same left edge; body
                # continuation of a long MCQ stem belongs in that question title.
                if numeric_question or chinese_question or sub_question:
                    while i + 1 < len(lines):
                        nxt = lines[i+1]
                        prev = title_lines[-1]
                        if nxt['uid'] in title_ids or POINT.match(nxt['text']) or NUMBER.match(nxt['text']) or CHINESE.match(nxt['text']) or SUB.match(nxt['text']):
                            break
                        close = prev['page'] == nxt['page'] and 0 < prev['y'] - nxt['y'] < .033
                        same_indent = abs(nxt['x'] - prev['x']) < .022
                        mcq = bid == 'lower' and section_index == 2
                        if close and same_indent and (mcq or (len(prev['text']) >= 30 and not re.search(r'[。！？：；]$', prev['text']))):
                            i += 1; title_lines.append(nxt); title = join([title, nxt['text']])
                        else:
                            break
                # Avoid a 45-page topic; batches depend on questions, not PDF pages.
                if bid == 'lower' and section_index == 2 and numeric_question and len(current['items']) >= 10:
                    start_topic(f'{question_mode} · 第{number_label}题起', sources=[number])
                if quick:
                    lead = re.split(r'[：:]', text, maxsplit=1)
                    if len(lead) == 2 and len(lead[0]) <= 40:
                        title = lead[0]
                        line = {**line, 'text': lead[1]}
                    else:
                        title = re.match(r'^[（(]\d+[）)]', text)[0] + '速查'
                start_unit(title or '知识点', number_label, [number])
                assigned.update(x['uid'] for x in title_lines)
                if quick:
                    unit['_lines'].append(line)
                i += 1
                continue
            if unit is None:
                start_unit(current['title'], sources=[number])
            unit['_lines'].append(line)
            assigned.add(line['uid'])
            i += 1
    assert accepted == assigned, (bid, 'Unassigned OCR lines', sorted(accepted - assigned)[:20])
    for topic in topics:
        for item in topic['items']:
            lines = item.pop('_lines')
            item['sourcePages'] = sorted(set(item['sourcePages'] + pages(lines)))
            diagram = topic['sectionNumber'] == 6 and bid == 'lower'
            item['blocks'] = reviewed_table_layout(layout_blocks(lines, diagram))
            item['layoutReview'] = diagram or any(book['pages'][p-1]['multiColumn'] for p in item['sourcePages'])
            if item['id'] == 'upper-s1-t1-q1':
                item['blocks'] = opening_tables()
                item['layoutReview'] = False
            if item['id'] == 'upper-s1-t1-q2':
                item['title'] = '马克思主义的基本特征'
                item['keywords'] = ['科学性', '人民性', '实践性', '发展性']
            if item['id'] == 'upper-s1-t2-q1':
                start = next(i for i, x in enumerate(lines) if x['text'].startswith('唯物主义：'))
                end = next(i for i, x in enumerate(lines) if x['text'].startswith('① 物质和意识的对立'))
                item['blocks'] = layout_blocks(lines[:start]) + [table('哲学划分', [
                    ['对世界本原问题的不同回答', '唯物主义：把世界的本原归结为物质，主张物质第一性，意识第二性，意识是物质的产物\n唯心主义：把世界的本原归结为精神，主张意识第一性，物质第二性，物质是意识的产物'],
                    ['对世界是否可知问题的不同回答', '可知论：认为世界是可以被认识的，存在和思维具有同一性\n不可知论：认为世界是不能被人所认识或不能被完全认识的，否认存在和思维的同一性'],
                    ['对世界是怎样存在的不同回答', '辩证法：坚持用联系的、发展的、全面的观点看世界，认为发展的根本原因在于事物的内部矛盾\n形而上学：用孤立的、静止的、片面的观点看问题，否认事物内部矛盾的存在和作用'],
                    ['对社会历史观基本问题的不同回答', '历史唯物主义（唯物史观）认为社会存在决定社会意识\n历史唯心主义（唯心史观）认为社会意识决定社会存在'],
                ], [11])] + layout_blocks(lines[end:])
                item['layoutReview'] = False
        if not topic['items']:
            # Keep a named section in the TOC only when there is readable content.
            continue
        topic['sourcePages'] = sorted(set(topic['sourcePages'] + [p for x in topic['items'] for p in x['sourcePages']]))
    topics = [t for t in topics if t['items']]
    output = {'schemaVersion': 1, 'bookId': bid, 'sourceSha256': book['sourceSha256'],
              'proofread': False, 'topics': topics,
              'audit': {'inputLines': len(accepted), 'assignedLines': len(assigned), 'removedRepeatedHeaders': len(ignored)}}
    (DATA / f'{bid}-reader.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
    return {'book': bid, 'topics': len(topics), 'items': sum(len(t['items']) for t in topics), **output['audit']}


if __name__ == '__main__':
    print(json.dumps([assemble('upper'), assemble('lower')], ensure_ascii=False, indent=2))
