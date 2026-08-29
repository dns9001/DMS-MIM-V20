import sys
import re

with open("server/data.ts", "r") as f:
    content = f.read()

target = r"""      fs\.writeFileSync\(DB_FILE_PATH, JSON\.stringify\(serialized, null, 2\), "utf-8"\);"""
repl = r"""      fs.promises.writeFile(DB_FILE_PATH, JSON.stringify(serialized, null, 2), "utf-8").catch(e => console.error("Async save error", e));"""

content = re.sub(target, repl, content)

target2 = r"""    if \(!saveDiskTimeout\) \{
      saveDiskTimeout = setTimeout\(\(\) => \{
        saveDiskTimeout = null;
        writeNow\(\);
      \}, 50\);
    \}"""
repl2 = r"""    if (!saveDiskTimeout) {
      saveDiskTimeout = setTimeout(() => {
        saveDiskTimeout = null;
        writeNow();
      }, 5000);
    }"""
content = re.sub(target2, repl2, content)

with open("server/data.ts", "w") as f:
    f.write(content)
