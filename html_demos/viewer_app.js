/**
 * i.MX RT1062 Peripheral Viewer Application (Visual Edition)
 */

const P_CATEGORIES = {
    "Core": ["SystemControl", "NVIC", "MPU", "STIR", "SCB", "FPU"],
    "System": ["CCM", "CCM_ANALOG", "IOMUXC", "IOMUXC_GPR", "SNVS", "SRC", "GPC", "PMU", "TEMPMON", "XTALOSC24M", "OCOTP", "BEE", "DCP", "TRNG"],
    "Memory": ["SEMC", "FLEXSPI", "FLEXSPI2", "FLEXRAM", "ROMC"],
    "DMA": ["DMA0", "DMAMUX"],
    "Analog": ["ADC", "ADC_ETC", "CMP", "AOI", "XBARA", "XBARB", "ACMP"],
    "Timers": ["GPT", "PIT", "TMR", "PWM", "ENC", "EWM", "WDOG", "RTWDOG"],
    "Display & Graphics": ["LCDIF", "PXP", "CSI"],
    "Connectivity": ["LPUART", "LPI2C", "LPSPI", "FLEXIO", "USDHC", "ENET", "USB", "USBPHY", "USBNC", "CAN"],
    "IO": ["GPIO", "KPP"],
    "Audio": ["SAI", "SPDIF", "MQS"]
};

const App = {
    // Data
    data: {},
    groups: {},

    // State
    currentView: 'dashboard',
    currentGroup: null,
    currentPeripheral: null,
    currentRegister: null,

    // UI Cache
    ui: {
        breadcrumb: document.getElementById('breadcrumb'),
        views: {
            dashboard: document.getElementById('view-dashboard'),
            instances: document.getElementById('view-instances'),
            registers: document.getElementById('view-registers'),
            detail: document.getElementById('view-register-detail')
        },
        containers: {
            dashboardGrid: document.getElementById('dashboard-grid'),
            groupGrid: document.getElementById('group-grid'),
            instanceList: document.getElementById('instance-list'),
            registerTableBody: document.getElementById('register-table-body'),
            bitVisualizer: document.getElementById('bit-visualizer'),
            fieldTableBody: document.getElementById('field-table-body')
        },
        titles: {
            group: document.getElementById('group-title'),
            peripheral: document.getElementById('peripheral-title'),
            base: document.getElementById('peripheral-base'),
            pDesc: document.getElementById('peripheral-desc'),

            // Detail titles
            regName: document.getElementById('detail-reg-name'),
            regOffset: document.getElementById('detail-reg-offset'),
            regDesc: document.getElementById('detail-reg-desc'),
            regAccess: document.getElementById('detail-reg-access'),
            regReset: document.getElementById('detail-reg-reset')
        }
    },

    init() {
        if (window.MCU_DATA) {
            this.data = window.MCU_DATA;
            this.processData();
            this.renderDashboard();
        } else {
            console.error("MCU Data missing");
        }
        this.bindEvents();
    },

    bindEvents() {
        this.ui.breadcrumb.addEventListener('click', (e) => {
            if (e.target.tagName === 'SPAN' && e.target.dataset.target) {
                // If targeting specific view (back nav)
                if (e.target.dataset.target === 'dashboard') {
                    this.navigate('dashboard');
                } else if (e.target.dataset.target === 'instances') {
                    this.navigate('instances');
                } else if (e.target.dataset.target === 'registers') {
                    this.navigate('registers');
                }
            }
        });
    },

    processData() {
        this.groups = {};
        for (const [key, periph] of Object.entries(this.data)) {
            // Clean up group name: "ADC_ETC" -> "ADC" or keep as is? 
            // The JSON typically has "groupName".
            let gName = periph.groupName || "Other";

            // Fix strict JSON grouping if needed. e.g. ADC1 has group ADC.

            if (!this.groups[gName]) this.groups[gName] = [];
            this.groups[gName].push(periph);
        }
        this.sortedGroupNames = Object.keys(this.groups).sort();
    },

    navigate(viewName) {
        // Toggle view visibility
        Object.values(this.ui.views).forEach(el => el.classList.remove('active'));
        if (this.ui.views[viewName]) this.ui.views[viewName].classList.add('active');

        this.currentView = viewName;
        this.updateBreadcrumb();
    },

    updateBreadcrumb() {
        const bc = this.ui.breadcrumb;
        bc.innerHTML = '';

        const createItem = (text, target, active = false) => {
            const span = document.createElement('span');
            span.textContent = text;
            if (target) span.dataset.target = target;
            if (active) span.classList.add('active');
            return span;
        };

        bc.appendChild(createItem('System', 'dashboard', this.currentView === 'dashboard'));

        if (this.currentView !== 'dashboard') {
            bc.appendChild(document.createTextNode(' / '));
            bc.appendChild(createItem(this.currentGroup, 'instances', this.currentView === 'instances')); // Group
        }

        if (this.currentView === 'registers' || this.currentView === 'detail') {
            bc.appendChild(document.createTextNode(' / '));
            bc.appendChild(createItem(this.currentPeripheral.name, 'registers', this.currentView === 'registers'));
        }

        if (this.currentView === 'detail') {
            bc.appendChild(document.createTextNode(' / '));
            bc.appendChild(createItem(this.currentRegister.name, null, true));
        }
    },

    /* --- DASHBOARD --- */
    renderDashboard() {
        const grid = this.ui.containers.dashboardGrid;
        const fallbackGrid = this.ui.containers.groupGrid;
        grid.innerHTML = '';
        fallbackGrid.innerHTML = '';

        const usedGroups = new Set();

        // 1. Render mapped categories
        for (const [catName, patterns] of Object.entries(P_CATEGORIES)) {
            const section = document.createElement('div');
            section.className = 'system-section';

            const title = document.createElement('h2');
            title.textContent = catName;
            section.appendChild(title);

            const mGrid = document.createElement('div');
            mGrid.className = 'module-grid';

            let hasItems = false;

            // Find groups matching patterns
            // Patterns are substring matches or exact matches for group names
            this.sortedGroupNames.forEach(gName => {
                // Check if this group belongs to this category
                // match if pattern is contained in gName e.g. "LPUART" matches "LPUART10"
                const match = patterns.some(p => gName.toUpperCase().includes(p.toUpperCase()) || p.toUpperCase() === gName.toUpperCase());

                if (match && !usedGroups.has(gName)) {
                    this.createModuleCard(gName, mGrid);
                    usedGroups.add(gName);
                    hasItems = true;
                }
            });

            if (hasItems) {
                section.appendChild(mGrid);
                grid.appendChild(section);
            }
        }

        // 2. Render remaining groups
        this.sortedGroupNames.forEach(gName => {
            if (!usedGroups.has(gName)) {
                this.createModuleCard(gName, fallbackGrid);
            }
        });
    },

    createModuleCard(gName, parent) {
        const count = this.groups[gName].length;
        const card = document.createElement('div');
        card.className = 'module-card';
        card.innerHTML = `${gName} <span style="color:var(--text-muted); font-size:0.8em; margin-left:4px;">(${count})</span>`;
        card.onclick = () => {
            this.currentGroup = gName;
            this.renderInstances(gName);
            this.navigate('instances');
        };
        parent.appendChild(card);
    },

    /* --- INSTANCES --- */
    renderInstances(groupName) {
        this.ui.titles.group.textContent = groupName;
        const container = this.ui.containers.instanceList;
        container.innerHTML = '';

        const instances = this.groups[groupName].sort((a, b) => a.name.localeCompare(b.name));

        instances.forEach(periph => {
            const el = document.createElement('div');
            el.className = 'instance-card';
            el.innerHTML = `
                <h3>${periph.name}</h3>
                <div class="instance-details">
                    <div>Base: ${periph.baseAddress}</div>
                    <div style="margin-top:0.5rem; line-height:1.4;">${periph.description}</div>
                </div>
            `;
            el.onclick = () => {
                this.currentPeripheral = periph;
                this.renderRegisters(periph);
                this.navigate('registers');
            };
            container.appendChild(el);
        });
    },

    /* --- REGISTER LIST --- */
    renderRegisters(periph) {
        this.ui.titles.peripheral.textContent = periph.name;
        this.ui.titles.base.textContent = "Base: " + periph.baseAddress;
        this.ui.titles.pDesc.textContent = periph.description;

        const tbody = this.ui.containers.registerTableBody;
        tbody.innerHTML = '';

        if (!periph.registers) return;

        // Sort by offset
        const regs = [...periph.registers].sort((a, b) => a.addressOffset - b.addressOffset);

        regs.forEach(reg => {
            const tr = document.createElement('tr');
            tr.className = 'register-row';
            const offset = '0x' + reg.addressOffset.toString(16).toUpperCase().padStart(2, '0');
            tr.innerHTML = `
                <td class="reg-name">${reg.name}</td>
                <td style="font-family:monospace; color:var(--text-muted)">+${offset}</td>
                <td class="reg-desc">${reg.description}</td>
            `;
            tr.onclick = () => {
                this.currentRegister = reg;
                this.renderDetail(reg);
                this.navigate('detail');
            };
            tbody.appendChild(tr);
        });
    },

    /* --- REGISTER DETAIL (Visualizer) --- */
    renderDetail(reg) {
        // Headers
        const t = this.ui.titles;
        t.regName.textContent = reg.name;
        t.regOffset.textContent = 'Offset: 0x' + reg.addressOffset.toString(16).toUpperCase().padStart(2, '0');
        t.regDesc.textContent = reg.description;
        t.regAccess.textContent = reg.access || 'R/W';
        t.regReset.textContent = reg.resetValue || '0x0';

        // 1. Bit Visualizer
        const viz = this.ui.containers.bitVisualizer;
        viz.innerHTML = '';

        // We need to fill bits 31..0
        // Find fields
        const fields = reg.fields ? [...reg.fields] : [];

        let currentBit = 31;

        // Sort fields descending by MSB
        // Note: Field definition usually has bitOffset (LSB) and bitWidth.
        // MSB = bitOffset + bitWidth - 1

        // Helper to get MSB
        const getMsb = (f) => f.bitOffset + f.bitWidth - 1;

        fields.sort((a, b) => getMsb(b) - getMsb(a));

        fields.forEach((field, index) => {
            const msb = getMsb(field);
            const lsb = field.bitOffset;

            // Check for gap (Reserved bits) before this field
            if (currentBit > msb) {
                const gapWidth = currentBit - msb;
                viz.appendChild(this.createBitBlock(null, gapWidth, currentBit));
                currentBit -= gapWidth;
            }

            // Create Field Block
            viz.appendChild(this.createBitBlock(field, field.bitWidth, msb, index));
            currentBit -= field.bitWidth;
        });

        // Check for trailing gap after last field down to 0
        if (currentBit >= 0) {
            viz.appendChild(this.createBitBlock(null, currentBit + 1, currentBit));
        }

        // 2. Field Table
        const tbody = this.ui.containers.fieldTableBody;
        tbody.innerHTML = '';

        if (fields.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="padding:1rem; text-align:center; color:var(--text-muted)">No bitfields defined. Full 32-bit register.</td></tr>';
        } else {
            fields.forEach((field, index) => {
                const tr = document.createElement('tr');
                tr.id = `field-row-${field.name}`; // Link for hover

                const msb = getMsb(field);
                const range = (msb === field.bitOffset) ? `${msb}` : `${msb}:${field.bitOffset}`;

                let enumHtml = '';
                if (field.enumeratedValues) {
                    enumHtml = '<div style="margin-top:0.5rem; font-size:0.75rem;"><code style="color:var(--text-muted)">Values:</code>';
                    enumHtml += '<ul style="margin:4px 0 0 0; padding-left:1rem; color:var(--text-muted);">';
                    field.enumeratedValues.forEach(ev => {
                        enumHtml += `<li><b>${ev.value}</b>: ${ev.name}</li>`;
                    });
                    enumHtml += '</ul></div>';
                }

                tr.innerHTML = `
                    <td style="font-family:monospace; font-weight:bold;">[${range}]</td>
                    <td style="font-weight:600; color:var(--text-main);">${field.name}</td>
                    <td>
                        <div>${field.description}</div>
                        ${enumHtml}
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    },

    createBitBlock(field, width, startBit, colorIndex = 0) {
        const div = document.createElement('div');
        div.className = 'bit-block';

        // Flex grow proportional to width. 
        // We use a large multiplier (e.g. 100) to ensure browsers respect ratio well
        div.style.flexGrow = width;
        // Width percentage for cleaner rendering is also possible, but flex-grow handles content agnostic
        div.style.width = `${(width / 32) * 100}%`;

        if (!field) {
            div.classList.add('reserved');
            div.title = `Reserved [${startBit}:${startBit - width + 1}]`;
        } else {
            const colorClass = `bit-color-${colorIndex % 5}`;
            div.classList.add(colorClass);
            div.textContent = width > 1 ? field.name : ''; // Only show text if enough space
            div.title = `${field.name} [${startBit}:${startBit - width + 1}]`;

            // Interaction
            div.onmouseenter = () => {
                const row = document.getElementById(`field-row-${field.name}`);
                if (row) {
                    row.classList.add('highlighted');
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            };
            div.onmouseleave = () => {
                const row = document.getElementById(`field-row-${field.name}`);
                if (row) row.classList.remove('highlighted');
            };
        }

        return div;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
