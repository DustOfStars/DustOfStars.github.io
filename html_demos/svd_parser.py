import xml.etree.ElementTree as ET
import json
import os
from copy import deepcopy
from typing import Optional, Dict, Any, List

# --- 配置 ---
SVD_FILE_NAME = "MIMXRT1062.svd"
OUTPUT_DIR = "MIMXRT1062_JSON_Peripherals_Complete"

# --- 辅助函数 ---

def svd_to_int(value: Optional[str]) -> Optional[int]:
    """
    将 SVD 文件中的字符串值（可能为十进制、十六进制）转换为 Python 整数。
    """
    if value is None:
        return None
    value = value.strip().replace(',', '')
    
    if not value:
        return None
        
    try:
        if value.lower().startswith('0x') or value.startswith('#'):
            hex_str = value.replace('0x', '').replace('#', '')
            return int(hex_str, 16)
        return int(value)
    except ValueError:
        return None

def get_text(element: ET.Element, tag: str) -> Optional[str]:
    """
    安全地获取指定子标签的文本内容。
    """
    sub_element = element.find(tag)
    if sub_element is not None and sub_element.text is not None:
        return sub_element.text.strip()
    return None

def strip_namespace(tree: ET.ElementTree) -> ET.ElementTree:
    """
    移除 XML 标签中的命名空间。
    """
    for elem in tree.iter():
        if '}' in elem.tag:
            elem.tag = elem.tag.split('}', 1)[1]
    return tree

# --- 核心解析函数 ---

def parse_enumerated_values(field_element: ET.Element) -> Optional[Dict[str, Any]]:
    """解析字段的枚举值 (Enumerated Values)"""
    enum_tag = field_element.find('enumeratedValues')
    if enum_tag is None:
        return None

    enum_data = {
        "usage": get_text(enum_tag, 'usage'),
        "values": []
    }

    for enum_value in enum_tag.findall('enumeratedValue'):
        enum_data["values"].append({
            "name": get_text(enum_value, 'name'),
            "description": get_text(enum_value, 'description'),
            "value": svd_to_int(get_text(enum_value, 'value'))
        })
    
    return enum_data

def parse_field(field_element: ET.Element) -> Dict[str, Any]:
    """解析寄存器中的位字段 (Field)"""
    field_data = {
        "name": get_text(field_element, 'name'),
        "description": get_text(field_element, 'description'),
        "bitOffset": svd_to_int(get_text(field_element, 'bitOffset')),
        "bitWidth": svd_to_int(get_text(field_element, 'bitWidth')),
        "access": get_text(field_element, 'access'),
        "readAction": get_text(field_element, 'readAction'),
    }

    enum_data = parse_enumerated_values(field_element)
    if enum_data:
        field_data["enumeratedValues"] = enum_data["values"]

    return {k: v for k, v in field_data.items() if v is not None}


def parse_register(register_element: ET.Element) -> Dict[str, Any]:
    """解析外设中的寄存器 (Register)"""
    register_data = {
        "name": get_text(register_element, 'name'),
        "description": get_text(register_element, 'description'),
        "addressOffset": svd_to_int(get_text(register_element, 'addressOffset')),
        # 错误修正：将 get_element_with_fallback 替换为 get_text
        "size": svd_to_int(get_text(register_element, 'size')), 
        "access": get_text(register_element, 'access'),
        "resetValue": get_text(register_element, 'resetValue'),
        "resetMask": get_text(register_element, 'resetMask'),
        "fields": []
    }

    fields_tag = register_element.find('fields')
    if fields_tag is not None:
        for field_element in fields_tag.findall('field'):
            register_data["fields"].append(parse_field(field_element))

    return {k: v for k, v in register_data.items() if v is not None}


def parse_peripheral(peripheral_element: ET.Element) -> Dict[str, Any]:
    """解析单个外设 (Peripheral)"""
    peripheral_data = {
        "name": get_text(peripheral_element, 'name'),
        "description": get_text(peripheral_element, 'description'),
        "groupName": get_text(peripheral_element, 'groupName'),
        "baseAddress": get_text(peripheral_element, 'baseAddress'),
        "registers": []
    }
    
    address_block = peripheral_element.find('addressBlock')
    if address_block is not None:
        peripheral_data["addressBlock"] = {
            "offset": get_text(address_block, 'offset'),
            "size": get_text(address_block, 'size'),
            "usage": get_text(address_block, 'usage'),
        }

    registers_container = peripheral_element.find('registers')
    elements_to_check = registers_container if registers_container is not None else peripheral_element

    for register_element in elements_to_check.findall('register'):
        # 只有存在 addressOffset 的寄存器才被视为实际的寄存器实例
        if get_text(register_element, 'addressOffset') is not None:
             peripheral_data["registers"].append(parse_register(register_element))

    return {k: v for k, v in peripheral_data.items() if v is not None}


# --- 解决外设继承问题的核心函数 ---

def resolve_all_peripherals(root: ET.Element) -> List[ET.Element]:
    """
    遍历所有外设，处理带有 derivedFrom 属性的继承关系，
    将基外设的寄存器和地址块复制到派生外设中，使其完整。
    """
    peripherals_tag = root.find('peripherals')
    if peripherals_tag is None:
        return []

    # 1. Map所有外设 by name
    peripheral_elements = {get_text(p, 'name'): p for p in peripherals_tag.findall('peripheral')}
    
    resolved_peripherals = []
    
    # 2. 遍历并解决继承关系
    for name, peripheral in peripheral_elements.items():
        derived_from = peripheral.get('derivedFrom')
        
        if derived_from:
            base_peripheral = peripheral_elements.get(derived_from)
            if base_peripheral is None:
                print(f"⚠️ 警告: 外设 {name} 声明继承自 {derived_from}，但未找到基外设。")
            else:
                # 继承 <addressBlock>
                if peripheral.find('addressBlock') is None:
                    base_block = base_peripheral.find('addressBlock')
                    if base_block is not None:
                        peripheral.append(deepcopy(base_block))
                        
                # 继承 <registers>
                if peripheral.find('registers') is None:
                    base_registers = base_peripheral.find('registers')
                    if base_registers is not None:
                        peripheral.append(deepcopy(base_registers))
        
        resolved_peripherals.append(peripheral)
        
    print(f"🔄 SVD Pre-processing: 已解析 {len(resolved_peripherals)} 个外设，并解决所有继承关系。")
    return resolved_peripherals


# --- 主执行函数 ---

def main():
    print(f"✅ 正在加载 SVD 文件: {SVD_FILE_NAME}...")

    if not os.path.exists(SVD_FILE_NAME):
        print(f"❌ 错误: 找不到文件 {SVD_FILE_NAME}。请确保文件位于同一目录。")
        return

    try:
        # 1. 解析 XML 文件并移除命名空间
        tree = ET.parse(SVD_FILE_NAME)
        root = tree.getroot()
        strip_namespace(tree)
        
        # 2. 解决所有外设继承关系
        peripherals_to_process = resolve_all_peripherals(root)
        
        # 3. 创建输出目录
        if not os.path.exists(OUTPUT_DIR):
            os.makedirs(OUTPUT_DIR)
            print(f"📂 已创建输出目录: {OUTPUT_DIR}")

        peripheral_count = 0
        
        # 4. 遍历已解决继承的外设并生成 JSON 文件
        for peripheral_element in peripherals_to_process:
            peripheral_data = parse_peripheral(peripheral_element)
            
            name = peripheral_data.get("name")
            if not name:
                continue
                
            json_file_name = f"{name}.json"
            output_path = os.path.join(OUTPUT_DIR, json_file_name)
            
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(peripheral_data, f, ensure_ascii=False, indent=2)
                
            peripheral_count += 1
            
        print(f"\n🎉 成功！共解析并生成了 {peripheral_count} 个完整的 JSON 外设文件。")
        print(f"文件保存在目录: {os.path.abspath(OUTPUT_DIR)}")

    except ET.ParseError as e:
        print(f"❌ XML 解析错误: {e}")
    except Exception as e:
        print(f"❌ 发生未知错误: {e}")

if __name__ == "__main__":
    main()