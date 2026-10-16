"""Bounded text extraction subprocess. No remote reads, macros or embedded files."""
import io
import json
import sys
import zipfile
import resource
from pathlib import Path
from defusedxml import ElementTree
from pypdf import PdfReader

MAX_TEXT = 100_000

def extract(path, extension):
    data = Path(path).read_bytes()
    if extension in ('.txt', '.md'):
        text = data.decode('utf-8-sig')
        if '\x00' in text or any(ord(c) < 32 and c not in '\n\r\t' for c in text):
            raise ValueError('Tệp text chứa ký tự nhị phân; dùng UTF-8 TXT/Markdown.')
    elif extension == '.pdf':
        if not data.startswith(b'%PDF-'): raise ValueError('Nội dung không phải PDF.')
        pdf = PdfReader(io.BytesIO(data), strict=True)
        if pdf.is_encrypted: raise ValueError('PDF có mật khẩu chưa được hỗ trợ.')
        if len(pdf.pages) > 100: raise ValueError('PDF vượt giới hạn 100 trang.')
        text = '\n'.join(page.extract_text() or '' for page in pdf.pages)
    elif extension == '.docx':
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            entries = archive.infolist()
            names = [e.filename for e in entries]
            if (len(entries) > 200 or len(names) != len(set(names))
                    or sum(e.file_size for e in entries) > 20_000_000
                    or any(e.flag_bits & 1 or e.file_size > 5_000_000
                           or e.file_size > max(e.compress_size, 1)*200 for e in entries)):
                raise ValueError('DOCX vượt giới hạn cấu trúc/nén hoặc có mã hóa.')
            if '[Content_Types].xml' not in names or 'word/document.xml' not in names:
                raise ValueError('Nội dung không phải DOCX.')
            if any('vbaProject' in n or n.startswith('word/embeddings/') for n in names):
                raise ValueError('DOCX chứa macro/embedded file chưa được hỗ trợ.')
            xml = archive.read('word/document.xml')
            if len(xml) > 2_000_000: raise ValueError('DOCX XML quá lớn.')
            root = ElementTree.fromstring(xml)
            ns = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
            text = '\n'.join(''.join(p.itertext()) if not list(p.iter(ns+'t')) else
                             ''.join(t.text or '' for t in p.iter(ns+'t')) for p in root.iter(ns+'p'))
    else: raise ValueError('Định dạng chưa được hỗ trợ.')
    text = text.replace('\r\n', '\n').replace('\r', '\n').strip()
    if len(text.encode('utf-8')) > MAX_TEXT: raise ValueError('Văn bản trích xuất vượt 100 KB; chia tài liệu nhỏ hơn.')
    return {'text': text, 'status': 'ready' if text else 'needs_text',
            'detail': 'Đã trích xuất text; chưa kiểm chứng ngữ nghĩa.' if text else
                      'Không tìm thấy text. PDF scan cần OCR bên ngoài hoặc upload bản TXT/Markdown; chưa chạy OCR.'}

if __name__ == '__main__':
    resource.setrlimit(resource.RLIMIT_AS, (512*1024*1024, 512*1024*1024))
    resource.setrlimit(resource.RLIMIT_CPU, (8, 8))
    try:
        result = extract(*sys.argv[1:]); code = 0
    except Exception as exc:
        # Parser internals may contain paths; expose only deliberately authored ValueError messages.
        result = {'error': str(exc) if type(exc) is ValueError else 'Không đọc được tệp. Kiểm tra cấu trúc, UTF-8 hoặc dùng bản TXT/Markdown.'}; code = 2
    print(json.dumps(result, ensure_ascii=False)); raise SystemExit(code)
