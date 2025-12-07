import os
import json

# Configuration
SOURCE_DIR = 'MIMXRT1062_JSON_Peripherals_Complete'
OUTPUT_FILE = 'mcu_data.js'

def bundle_data():
    if not os.path.exists(SOURCE_DIR):
        print(f"Error: Directory '{SOURCE_DIR}' not found.")
        return

    peripherals = {}
    
    # Iterate over all JSON files in the source directory
    for filename in os.listdir(SOURCE_DIR):
        if filename.lower().endswith('.json'):
            file_path = os.path.join(SOURCE_DIR, filename)
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    
                    # Store by peripheral name (e.g., "ADC1")
                    # Using the filename as key sometimes helps if internal name varies, 
                    # but usually 'name' field is best.
                    name = data.get('name', filename.replace('.json', ''))
                    peripherals[name] = data
                    print(f"Loaded {name}")
            except Exception as e:
                print(f"Failed to load {filename}: {e}")

    # Create the JS content
    # We assign it to a global variable window.MCU_DATA
    json_str = json.dumps(peripherals, indent=None)  # Minified for size
    js_content = f"window.MCU_DATA = {json_str};"

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write(js_content)
    
    print(f"Successfully created {OUTPUT_FILE} with {len(peripherals)} peripherals.")

if __name__ == "__main__":
    bundle_data()
