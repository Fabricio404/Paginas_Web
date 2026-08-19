import json
import os

log_path = r"C:\Users\kenny\.gemini\antigravity-ide\brain\f6654e6a-dc71-4f65-9afc-8a9ec34b3503\.system_generated\logs\transcript.jsonl"

# Read logs
with open(log_path, encoding='utf-8') as f:
    lines = f.readlines()

tool_calls = []
for l in lines:
    try:
        data = json.loads(l)
        if "tool_calls" in data:
            tool_calls.extend(data["tool_calls"])
    except:
        pass

# Filter only replacements applied to our active project directory
base_dir = r"f:\Taberna\web2\Maillard_1_0_0\Maillard_1_0_0"
replaces = []

for call in tool_calls:
    name = call.get("name")
    args = call.get("arguments", {})
    if not isinstance(args, dict):
        continue
    target_file = args.get("TargetFile", "")
    if "maillard_1_0_0" in target_file.lower() and target_file.endswith(".html"):
        if name == "default_api:replace_file_content":
            replaces.append({"type": "single", "args": args})
        elif name == "default_api:multi_replace_file_content":
            replaces.append({"type": "multi", "args": args})

print(f"Found {len(replaces)} replacement operations for HTML files.")

# Group by file
from collections import defaultdict
file_patches = defaultdict(list)
for p in replaces:
    file_patches[p["args"]["TargetFile"]].append(p)

for filepath, patches in file_patches.items():
    if not os.path.exists(filepath):
        continue
    print(f"Applying {len(patches)} patches to {filepath}")
    
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
        
    for p in patches:
        args = p["args"]
        if p["type"] == "single":
            target = args["TargetContent"]
            repl = args["ReplacementContent"]
            if target in content:
                content = content.replace(target, repl)
            else:
                print(f"  [Warning] Target not found in {os.path.basename(filepath)}")
        elif p["type"] == "multi":
            chunks = args.get("ReplacementChunks", [])
            for chunk in chunks:
                target = chunk["TargetContent"]
                repl = chunk["ReplacementContent"]
                if target in content:
                    content = content.replace(target, repl)
                else:
                    print(f"  [Warning] Chunk Target not found in {os.path.basename(filepath)}")
                    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
        
print("Reconstruction finished!")
