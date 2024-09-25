import os
import json

def map_dir_with_java_content(path):
    dir_map = {'type': 'directory', 'name': os.path.basename(path), 'children': []}
    try:
        for name in os.listdir(path):
            full_path = os.path.join(path, name)
            if os.path.isdir(full_path):
                dir_map['children'].append(map_dir_with_java_content(full_path))
            else:
                file_entry = {'type': 'file', 'name': name}
                # If it's a .java file, read its content.
                if not name.endswith(".py") and not name.endswith(".jpeg") and not name.endswith(".jpg") and not name.endswith(".txt") and not name.endswith("."):
                    with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
                        file_entry["content"] = f.read()
                dir_map['children'].append(file_entry)
    except PermissionError:
        pass
    return dir_map

# Generate the improved directory map for the current directory
improved_dir_map = map_dir_with_java_content('.')

# Save the improved directory map to dir_map.json
with open('dir_map.json', 'w', encoding='utf-8') as f:
    json.dump(improved_dir_map, f, indent=4)

print("Mappa della directory generata con successo e salvata in dir_map.json!")