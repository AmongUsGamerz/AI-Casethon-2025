import os
import shutil

# === Path Configuration ===
LABEL_FILE = "labels.txt"  # must be in same folder as this script
IMAGES_RAW_DIR = "classification_dataset/images_raw"
OUTPUT_DIR = "classification_dataset/images"

# === Ensure folders exist ===
if not os.path.exists(LABEL_FILE):
    raise FileNotFoundError(f"❌ Could not find {LABEL_FILE}")

if not os.path.exists(IMAGES_RAW_DIR):
    raise FileNotFoundError(f"❌ Could not find {IMAGES_RAW_DIR}")

os.makedirs(OUTPUT_DIR, exist_ok=True)

# === Read labels and sort images ===
copied = 0
missing = 0

with open(LABEL_FILE, "r") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        
        # Each line: "image_name species"
        parts = line.split()
        if len(parts) != 2:
            print(f"⚠️ Skipping malformed line: {line}")
            continue
        
        img_name, species = parts
        src_path = os.path.join(IMAGES_RAW_DIR, img_name)
        species_folder = os.path.join(OUTPUT_DIR, species)
        dst_path = os.path.join(species_folder, img_name)

        os.makedirs(species_folder, exist_ok=True)  # create species folder if missing

        if os.path.exists(src_path):
            # you can change shutil.copy to shutil.move if you want to move instead of copy
            shutil.copy(src_path, dst_path)
            copied += 1
        else:
            print(f"⚠️ Image not found: {img_name}")
            missing += 1

print(f"\n✅ Sorting complete!")
print(f"📦 {copied} images copied into species folders.")
if missing > 0:
    print(f"⚠️ {missing} images were not found in images_raw.")
