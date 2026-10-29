"""Read-only native edge hit testing for an offscreen QA window. No mouse input."""
import ctypes
import json
import sys
from ctypes import wintypes

user32 = ctypes.WinDLL('user32', use_last_error=True)
user32.SetProcessDpiAwarenessContext.argtypes = [ctypes.c_void_p]
user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
user32.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
user32.GetWindowLongW.argtypes = [wintypes.HWND, ctypes.c_int]
user32.GetWindowLongW.restype = ctypes.c_long
user32.SendMessageW.argtypes = [wintypes.HWND, wintypes.UINT, ctypes.c_size_t, ctypes.c_ssize_t]
user32.SendMessageW.restype = ctypes.c_ssize_t
handle = int(sys.argv[1])
rect = wintypes.RECT()
if not user32.GetWindowRect(handle, ctypes.byref(rect)):
    raise ctypes.WinError(ctypes.get_last_error())
offscreen = -32768 < rect.left < rect.right < -10000 and -32768 < rect.top < rect.bottom < -10000
alpha, flags, color = wintypes.BYTE(), wintypes.DWORD(), wintypes.DWORD()
user32.GetLayeredWindowAttributes.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD), ctypes.POINTER(wintypes.BYTE), ctypes.POINTER(wintypes.DWORD)]
alpha_valid = user32.GetLayeredWindowAttributes(handle, ctypes.byref(color), ctypes.byref(alpha), ctypes.byref(flags))
if not offscreen and not (alpha_valid and flags.value & 2 and alpha.value == 0):
    raise RuntimeError('Native edge probe requires an offscreen or confirmed fully invisible window')
xmid, ymid = (rect.left + rect.right) // 2, (rect.top + rect.bottom) // 2
points = {
    'top': (xmid, rect.top + 2), 'bottom': (xmid, rect.bottom - 3),
    'left': (rect.left + 2, ymid), 'right': (rect.right - 3, ymid),
    'topLeft': (rect.left + 2, rect.top + 2), 'topRight': (rect.right - 3, rect.top + 2),
    'bottomLeft': (rect.left + 2, rect.bottom - 3), 'bottomRight': (rect.right - 3, rect.bottom - 3),
}
hits = {key: user32.SendMessageW(handle, 0x84, 0, (x & 0xffff) | ((y & 0xffff) << 16)) for key, (x, y) in points.items()}
style = user32.GetWindowLongW(handle, -16)
scans = {}
for depth in range(0, 18):
    scan_points = {'top': (xmid, rect.top + depth), 'bottom': (xmid, rect.bottom - 1 - depth), 'left': (rect.left + depth, ymid), 'right': (rect.right - 1 - depth, ymid)}
    scans[str(depth)] = {key: user32.SendMessageW(handle, 0x84, 0, (x & 0xffff) | ((y & 0xffff) << 16)) for key, (x, y) in scan_points.items()}
print(json.dumps({'thickFrame': bool(style & 0x40000), 'style': style, 'hits': hits, 'scans': scans, 'nativeAlpha': alpha.value if alpha_valid else None, 'rect': [rect.left, rect.top, rect.right, rect.bottom]}))
