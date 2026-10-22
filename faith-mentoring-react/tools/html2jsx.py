#!/usr/bin/env python3
"""Convert a fragment of the original page HTML into JSX with the same DOM.

Usage: html2jsx.py FILE [--from REGEX] [--to REGEX] [--indent N]
  --from/--to pick the slice of FILE to convert (first match of each; default: <body> contents).

Rules (so the rendered DOM matches the original):
- attributes renamed for React (class→className, for→htmlFor, stroke-width→strokeWidth, …),
  style strings become objects, value/checked become defaultValue/defaultChecked;
- inline on*="…" handlers are left as /* on*="…" */ comments to be wired by hand (grep "/* on");
- whitespace between sibling elements, which HTML renders as one space, is kept as {' '}
  (except inside table/list/select structure); text keeps leading/trailing spaces that touch an
  element; <pre>/<textarea> content is kept verbatim;
- <script> blocks are dropped; HTML comments become JSX comments.
"""
import argparse
import html
import json
import re
from html.parser import HTMLParser

# Old multi-page URLs → new routes (same table as src/app/legacyRedirects.js).
def _legacy_map():
    import pathlib
    js = (pathlib.Path(__file__).resolve().parent.parent / 'src' / 'app' / 'legacyRedirects.js').read_text()
    return dict(re.findall(r"'(/[A-Z_]+/HTML/[a-z-]+\.html|/index\.html)': '([^']+)'", js))
LEGACY = _legacy_map()


PORTAL = None   # set by --portal: resolves relative "page.html" links against /PORTAL/HTML/


def rewrite_href(value):
    if PORTAL and re.match(r'^[a-z-]+\.html([?#].*)?$', value):
        value = f'/{PORTAL}/HTML/' + value
    m = re.match(r'^(/[A-Z_]+/HTML/[a-z-]+\.html|/index\.html)([?#].*)?$', value)
    if not m or m.group(1) not in LEGACY:
        return value
    target, rest = LEGACY[m.group(1)], m.group(2) or ''
    if ':id' in target:
        q = re.search(r'[?&]id=([^&#]*)', rest)
        target = target.replace(':id', q.group(1)) if q else target.replace('/:id', '')
        rest = re.sub(r'([?&])id=[^&#]*&?', r'\1', rest).replace('?#', '#').rstrip('?&')
    return target + rest


VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}
STRUCTURE = {'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'colgroup', 'col', 'ul', 'ol', 'select',
             'optgroup', 'datalist', 'head', 'html'}
RENAME = {
    'class': 'className', 'for': 'htmlFor', 'tabindex': 'tabIndex', 'readonly': 'readOnly',
    'maxlength': 'maxLength', 'minlength': 'minLength', 'colspan': 'colSpan', 'rowspan': 'rowSpan',
    'autocomplete': 'autoComplete', 'autofocus': 'autoFocus', 'enctype': 'encType',
    'crossorigin': 'crossOrigin', 'srcset': 'srcSet', 'contenteditable': 'contentEditable',
    'spellcheck': 'spellCheck', 'inputmode': 'inputMode', 'novalidate': 'noValidate',
    'accept-charset': 'acceptCharset', 'http-equiv': 'httpEquiv', 'xlink:href': 'xlinkHref',
    'xml:space': 'xmlSpace', 'viewbox': 'viewBox', 'frameborder': 'frameBorder',
    'allowfullscreen': 'allowFullScreen', 'cellpadding': 'cellPadding', 'cellspacing': 'cellSpacing',
    'datetime': 'dateTime', 'formnovalidate': 'formNoValidate', 'referrerpolicy': 'referrerPolicy',
    'popovertarget': 'popoverTarget', 'enterkeyhint': 'enterKeyHint',
}
BOOLEAN = {'disabled', 'checked', 'selected', 'hidden', 'required', 'multiple', 'readonly', 'autofocus',
           'autoplay', 'controls', 'loop', 'muted', 'novalidate', 'open', 'allowfullscreen', 'defer', 'async',
           'playsinline', 'formnovalidate'}


def camel(name):
    return re.sub(r'-([a-z])', lambda m: m.group(1).upper(), name)


def style_obj(text):
    out = []
    for decl in re.split(r';(?![^(]*\))', text):
        if ':' not in decl:
            continue
        prop, val = decl.split(':', 1)
        prop, val = prop.strip(), val.strip()
        if not prop:
            continue
        if prop.startswith('--'):
            key = json.dumps(prop)
        else:
            key = camel(prop[1:].capitalize() if prop.startswith('-') else prop)
            key = re.sub(r'^Ms', 'ms', key)
        out.append(f'{key}: {json.dumps(html.unescape(val))}')
    return '{{ ' + ', '.join(out) + ' }}'


def attr_jsx(tag, name, value):
    lname = name.lower()
    if lname.startswith('on'):
        return f'/* {lname}={json.dumps(value)} */'
    if lname == 'style':
        return f'style={style_obj(value or "")}'
    if value is None or (lname in BOOLEAN and value in ('', lname)):
        key = RENAME.get(lname, lname)
        if lname == 'checked' and tag == 'input':
            key = 'defaultChecked'
        if lname == 'selected' and tag == 'option':
            return '/* selected */'
        return key
    if lname == 'value' and tag in ('input', 'textarea', 'select'):
        return f'defaultValue={json.dumps(html.unescape(value))}'
    if lname.startswith(('data-', 'aria-')):
        key = lname
    elif lname in RENAME:
        key = RENAME[lname]
    elif '-' in lname or ':' in lname:
        key = camel(lname.replace(':', '-'))
    else:
        key = name if any(c.isupper() for c in name) else lname
    raw = rewrite_href(value) if lname == 'href' else value
    if '"' in raw or '{' in raw or '}' in raw or '\\' in raw:
        return f'{key}={{{json.dumps(html.unescape(raw))}}}'
    return f'{key}="{raw}"'


class Node:
    def __init__(self, tag, attrs, parent):
        self.tag, self.attrs, self.parent, self.children = tag, attrs, parent, []


class Builder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.root = Node('#root', [], None)
        self.cur = self.root
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag == 'script':
            self.skip += 1
            return
        if self.skip:
            return
        n = Node(tag, attrs, self.cur)
        self.cur.children.append(n)
        if tag not in VOID:
            self.cur = n

    def handle_startendtag(self, tag, attrs):
        if self.skip or tag == 'script':
            return
        self.cur.children.append(Node(tag, attrs, self.cur))

    def handle_endtag(self, tag):
        if tag == 'script':
            self.skip -= 1
            return
        if self.skip or tag in VOID:
            return
        n = self.cur
        while n is not self.root and n.tag != tag:
            n = n.parent
        if n is not self.root:
            self.cur = n.parent

    def handle_data(self, data):
        if not self.skip:
            self.cur.children.append(data)

    def handle_entityref(self, name):
        if not self.skip:
            self.cur.children.append(f'&{name};')

    def handle_charref(self, name):
        if not self.skip:
            self.cur.children.append(f'&#{name};')

    def handle_comment(self, data):
        if not self.skip:
            self.cur.children.append(('#comment', data))


def merge_text(children):
    out = []
    for c in children:
        if isinstance(c, str) and out and isinstance(out[-1], str):
            out[-1] += c
        else:
            out.append(c)
    return out


def jsx_text(t):
    # Braces must be escaped in JSX text; entities are fine as-is.
    return t.replace('{', "{'{'}").replace('}', "{'}'}").replace('<', '&lt;').replace('>', '&gt;')


def render(node, depth, ind, pre=False):
    pad = ' ' * (depth * ind)
    attrs = ' '.join(attr_jsx(node.tag, k, v) for k, v in node.attrs)
    open_ = f'<{node.tag}' + (' ' + attrs if attrs else '')
    if node.tag in VOID:
        return [pad + open_ + ' />']
    kids = merge_text(node.children)
    if node.tag in ('pre', 'textarea') or pre:
        text = ''.join(c if isinstance(c, str) else '' for c in kids)
        if node.tag == 'textarea':
            return [pad + open_ + (f' defaultValue={json.dumps(html.unescape(text))}' if text.strip() else '') + ' />']
        inner = ''.join(c if isinstance(c, str) else '' for c in kids)
        return [pad + open_ + '>{' + json.dumps(html.unescape(inner)) + '}</' + node.tag + '>']
    lines = []
    parts = []
    for i, c in enumerate(kids):
        prev_el = i > 0 and not isinstance(kids[i - 1], str)
        next_el = i + 1 < len(kids) and not isinstance(kids[i + 1], str)
        if isinstance(c, tuple):
            body = c[1].strip().replace('*/', '* /')
            if body:
                parts.append(('line', '{/* ' + re.sub(r'\s+', ' ', body) + ' */}'))
            continue
        if isinstance(c, str):
            if not c.strip():
                if prev_el and next_el and node.tag not in STRUCTURE:
                    parts.append(('line', "{' '}"))
                continue
            text = re.sub(r'\s+', ' ', c)
            lead = text.startswith(' ') and prev_el
            trail = text.endswith(' ') and next_el
            text = text.strip()
            parts.append(('line', ("{' '}" if lead else '') + jsx_text(text) + ("{' '}" if trail else '')))
            continue
        parts.append(('node', c))
    simple = all(k == 'line' for k, _ in parts) and sum(len(v) for _, v in parts) < 80
    if not parts:
        return [pad + open_ + '></' + node.tag + '>']
    if simple:
        return [pad + open_ + '>' + ''.join(v for _, v in parts) + '</' + node.tag + '>']
    lines.append(pad + open_ + '>')
    for kind, v in parts:
        if kind == 'line':
            lines.append(pad + ' ' * ind + v)
        else:
            lines.extend(render(v, depth + 1, ind))
    lines.append(pad + f'</{node.tag}>')
    return lines


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('file')
    ap.add_argument('--from', dest='start')
    ap.add_argument('--to', dest='end')
    ap.add_argument('--indent', type=int, default=2)
    ap.add_argument('--depth', type=int, default=3)
    ap.add_argument('--portal')
    a = ap.parse_args()
    global PORTAL
    PORTAL = a.portal
    src = open(a.file, encoding='utf-8').read()
    if a.start or a.end:
        s = re.search(a.start, src).start() if a.start else 0
        e = re.search(a.end, src[s:]).start() + s if a.end else len(src)
        src = src[s:e]
    else:
        m = re.search(r'<body[^>]*>([\s\S]*)</body>', src)
        src = m.group(1) if m else src
    b = Builder()
    b.feed(src)
    out = []
    for c in merge_text(b.root.children):
        if isinstance(c, str):
            if c.strip():
                out.append(' ' * (a.depth * a.indent) + jsx_text(re.sub(r'\s+', ' ', c.strip())))
        elif isinstance(c, tuple):
            body = re.sub(r'\s+', ' ', c[1].strip()).replace('*/', '* /')
            if body:
                out.append(' ' * (a.depth * a.indent) + '{/* ' + body + ' */}')
        else:
            out.extend(render(c, a.depth, a.indent))
    print('\n'.join(out))


if __name__ == '__main__':
    main()
