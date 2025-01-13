import os
import json

def map_dir_with_content(path, ignore_dirs=None, ignore_extensions=None):
    if ignore_dirs is None:
        ignore_dirs = set()
    if ignore_extensions is None:
        ignore_extensions = set()

    dir_map = {'type': 'directory', 'name': os.path.basename(path), 'children': []}

    try:
        # Lista degli elementi nella directory corrente
        for name in os.listdir(path):
            full_path = os.path.join(path, name)

            if os.path.isdir(full_path):
                sub_dir_map = {'type': 'directory', 'name': name, 'children': []}
                # Se la cartella è nella lista di esclusione, non aggiungiamo i suoi contenuti
                if name in ignore_dirs:
                    dir_map['children'].append(sub_dir_map)
                else:
                    # Altrimenti, mappiamo il contenuto della cartella ricorsivamente
                    mapped_sub_dir = map_dir_with_content(full_path, ignore_dirs, ignore_extensions)
                    if mapped_sub_dir is not None:
                        dir_map['children'].append(mapped_sub_dir)
            else:
                file_extension = os.path.splitext(name)[1]
                file_entry = {'type': 'file', 'name': name}
                # Se il file ha un'estensione da ignorare, non leggiamo il contenuto
                if file_extension in ignore_extensions:
                    dir_map['children'].append(file_entry)
                else:
                    try:
                        with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
                            file_entry["content"] = f.read()
                    except Exception as e:
                        file_entry["error"] = str(e)
                    dir_map['children'].append(file_entry)
    except PermissionError:
        pass

    return dir_map

# Specifica le cartelle e le estensioni da ignorare
ignore_dirs = {'node_modules', '.git', '__pycache__'}
ignore_extensions = {'.svg', '.png', '.mp4', '.otf', '.jpeg', '.json', '.text', '.txt', '.py'}

# Genera la mappa della directory corrente escludendo i contenuti specificati
improved_dir_map = map_dir_with_content('.', ignore_dirs, ignore_extensions)

# Salva la mappa della directory in dir_map.json
with open('dir_map.json', 'w', encoding='utf-8') as f:
    json.dump(improved_dir_map, f, indent=4)

print("Mappa della directory generata con successo e salvata in dir_map.json!")