"""Connection boundary: storing a link never fetches it or grants Google access."""
import re
from urllib.parse import urlsplit, parse_qs

class DriveUnavailable(Exception):
    pass

def canonical_url(value):
    url = urlsplit(value)
    if url.scheme != 'https' or url.username or url.password or url.port:
        raise ValueError('Dùng link HTTPS của file Google Drive/Docs, không chứa thông tin đăng nhập.')
    file_id = None
    if url.hostname == 'drive.google.com':
        match = re.fullmatch(r'/file/d/([A-Za-z0-9_-]{5,200})(?:/view|/edit|/preview)?/?', url.path)
        if match: file_id = match[1]
        elif url.path == '/open': file_id = parse_qs(url.query).get('id', [None])[0]
    elif url.hostname == 'docs.google.com':
        match = re.fullmatch(r'/(?:document|spreadsheets|presentation)/d/([A-Za-z0-9_-]{5,200})(?:/edit|/view|/preview)?/?', url.path)
        if match: file_id = match[1]
    if not file_id or not re.fullmatch(r'[A-Za-z0-9_-]{5,200}', file_id):
        raise ValueError('Link cần trỏ tới một file Drive/Docs cụ thể; chưa hỗ trợ thư mục.')
    return 'https://drive.google.com/file/d/'+file_id+'/view'

class GoogleDriveAdapter:
    def status(self):
        return {'connected': False, 'status': 'not_configured',
                'message': 'Chưa kết nối Google OAuth. Link được lưu nhưng chưa đọc được nội dung; không cần đặt file công khai.'}

    def read(self, url, project_id, actor):
        # Future implementation must resolve actor/project grants and server-side OAuth token store.
        raise DriveUnavailable('Google Drive chưa được cấp quyền đọc.')

drive = GoogleDriveAdapter()
