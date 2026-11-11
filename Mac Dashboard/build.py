"""Package existing artwork into the inline HA resource. Does not edit the image."""
from pathlib import Path
import base64
p=Path(__file__).parent
source=(p/'mac-studio.js').read_text()
image='data:image/webp;base64,'+base64.b64encode((p/'assets/mac-workstation.webp').read_bytes()).decode()
source=source.replace('__WORKSTATION_IMAGE__',image).encode('ascii','backslashreplace').decode('ascii')
assert len(source.encode()) < 128*1024
(p/'mac-studio.bundle.js').write_text(source)
print(f'Packaged resource: {len(source.encode()):,} bytes')
