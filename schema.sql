-- Database Schema for Sanitation Management System
-- UTF-8 encoding is supported by default in SQLite

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL, -- 'coordinator', 'supervisor', 'worker', 'validator'
    personal_code TEXT UNIQUE,
    is_approved INTEGER DEFAULT 1,
    is_active INTEGER DEFAULT 1,
    language TEXT DEFAULT 'en',
    profile_image TEXT,
    reset_code TEXT,
    reset_code_expires DATETIME,
    reset_requested INTEGER DEFAULT 0,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Protocols Table
CREATE TABLE IF NOT EXISTS protocols (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    steps TEXT NOT NULL, -- JSON array of steps: '["Step 1", "Step 2"]'
    estimated_duration INTEGER NOT NULL, -- in minutes
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Facility Nodes Table (Adjacency list for hierarchy: Facility -> Station -> Area -> Machine -> Production Line)
CREATE TABLE IF NOT EXISTS facility_nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER,
    type TEXT NOT NULL, -- 'facility', 'station', 'area', 'machine', 'line'
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'maintenance', 'inactive'
    assigned_protocol_id INTEGER,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES facility_nodes(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_protocol_id) REFERENCES protocols(id) ON DELETE SET NULL
);

-- 4. Inventory Table
CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL, -- 'chemical', 'consumable', 'equipment'
    stock REAL NOT NULL DEFAULT 0.0,
    min_stock REAL NOT NULL DEFAULT 0.0, -- for low stock alert
    unit TEXT NOT NULL, -- 'L', 'kg', 'units', 'rolls'
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. Protocol Requirements Table (Products and equipment required for a protocol)
CREATE TABLE IF NOT EXISTS protocol_requirements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    protocol_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    quantity_required REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (protocol_id) REFERENCES protocols(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES inventory(id) ON DELETE CASCADE
);

-- 6. Tasks Table
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    protocol_id INTEGER NOT NULL,
    worker_id INTEGER NOT NULL,
    supervisor_id INTEGER NOT NULL,
    node_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'assigned', -- 'assigned', 'accepted', 'in_progress', 'pending_validation', 'completed', 'rejected'
    start_time TEXT, -- DATETIME string
    end_time TEXT, -- DATETIME string
    notes TEXT,
    rejection_reason TEXT,
    photo_before TEXT,
    photo_after TEXT,
    photo_location TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (protocol_id) REFERENCES protocols(id),
    FOREIGN KEY (worker_id) REFERENCES users(id),
    FOREIGN KEY (supervisor_id) REFERENCES users(id),
    FOREIGN KEY (node_id) REFERENCES facility_nodes(id)
);

-- 7. Task Consumptions Table
CREATE TABLE IF NOT EXISTS task_consumptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    quantity_used REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES inventory(id)
);

-- 8. Inventory Logs Table
CREATE TABLE IF NOT EXISTS inventory_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    task_id INTEGER,
    quantity REAL NOT NULL, -- negative for deduction, positive for addition
    user_id INTEGER,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES inventory(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 9. Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT NOT NULL,
    role TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 10. Sessions Table
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_json TEXT NOT NULL,
    last_activity TEXT NOT NULL,
    created_at TEXT NOT NULL
);


-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_facility_nodes_parent ON facility_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_item ON inventory_logs(item_id);

-- SEED DATA

-- Default Admin User (Sanitation Coordinator)
-- Password hashed with PBKDF2 in Python, but we will seed a plain/hashed one that app.py recognizes,
-- or app.py will automatically hash it if it's plaintext on first boot. We will insert plain text and let app.py handle it,
-- or seed it using a simple sha256 or bcrypt. Let's seed plain 'admin'/'admin' and let app.py's login route handle checking it, 
-- or auto-hash it in Python.
INSERT INTO users (username, password, name, role, personal_code, is_approved, language) VALUES
('admin', 'admin', 'Sanitation Coordinator', 'coordinator', '0000', 1, 'en'),
('supervisor1', 'password', 'Sarah Supervisor', 'supervisor', '1111', 1, 'en'),
('worker1', 'password', 'Waleed Worker', 'worker', '2222', 1, 'en'),
('validator1', 'password', 'Victor Validator', 'validator', '3333', 1, 'en');

-- Seed Inventory
INSERT INTO inventory (name, category, stock, min_stock, unit) VALUES
('Alcohol Sanitizer 70%', 'chemical', 120.0, 30.0, 'L'),
('Industrial Detergent', 'chemical', 80.0, 20.0, 'L'),
('Broad-Spectrum Disinfectant', 'chemical', 60.0, 15.0, 'L'),
('Sanitation Wipes', 'consumable', 45.0, 10.0, 'rolls'),
('Microfiber Cloths', 'consumable', 150.0, 40.0, 'units'),
('Heavy-Duty Brushes', 'equipment', 12.0, 3.0, 'units'),
('Pressure Spray Bottle', 'equipment', 8.0, 2.0, 'units');

-- Seed Protocols
INSERT INTO protocols (name, description, steps, estimated_duration) VALUES
('Daily Alcohol Sanitization', 'Standard daily sanitization of machines and touch points using 70% alcohol.', '["Prepare personal protective equipment (PPE)", "Wipe machine surfaces with microfiber cloth to remove dust", "Spray 70% alcohol thoroughly on all touch points", "Allow to air dry for 5 minutes", "Log completion and photos"]', 15),
('Weekly Deep Cleaning', 'Complete washdown of production lines, including foam detergent and sanitizer rinse.', '["Lockout/Tagout the machine electrical panel", "Pre-rinse with warm water", "Apply industrial foaming detergent", "Scrub surfaces with heavy-duty brushes", "Rinse detergent thoroughly with clean water", "Inspect for organic residue", "Spray disinfectant and let sit for 10 minutes", "Final rinse with sanitised water", "Remove lockout/tagout and dry"]', 90);

-- Seed Protocol Requirements
-- Daily Alcohol Sanitization requires: 0.5 L of Alcohol (item 1), 1 Microfiber Cloth (item 5)
INSERT INTO protocol_requirements (protocol_id, item_id, quantity_required) VALUES
(1, 1, 0.5),
(1, 5, 1.0);

-- Weekly Deep Cleaning requires: 2 L of Detergent (item 2), 1 L of Disinfectant (item 3), 3 Microfiber Cloths (item 5), 1 Heavy-Duty Brush (item 6)
INSERT INTO protocol_requirements (protocol_id, item_id, quantity_required) VALUES
(2, 2, 2.0),
(2, 3, 1.0),
(2, 5, 3.0),
(2, 6, 1.0);

-- Seed Facility Hierarchy (Facility -> Station -> Area -> Machine -> Production Line)
-- Facility
INSERT INTO facility_nodes (id, parent_id, type, name, description, status, assigned_protocol_id) VALUES
(1, NULL, 'facility', 'Main Industrial Complex', 'Primary manufacturing facility', 'active', NULL);

-- Stations (Station A, Station B)
INSERT INTO facility_nodes (id, parent_id, type, name, description, status, assigned_protocol_id) VALUES
(2, 1, 'station', 'Station A (Grading & Sorting)', 'Inbound raw material processing station', 'active', NULL),
(3, 1, 'station', 'Station B (Packaging & Packing)', 'Outbound product packaging station', 'active', NULL);

-- Areas (Grading Area, Packing Area)
INSERT INTO facility_nodes (id, parent_id, type, name, description, status, assigned_protocol_id) VALUES
(4, 2, 'area', 'Grading Area', 'Material sorting and grading zone', 'active', NULL),
(5, 3, 'area', 'Packing Area', 'Secondary packing and palletizing zone', 'active', NULL);

-- Machines in Grading Area
INSERT INTO facility_nodes (id, parent_id, type, name, description, status, assigned_protocol_id) VALUES
(6, 4, 'machine', 'Grading Machine 01', 'High-speed optical grader', 'active', 1),
(7, 4, 'machine', 'Sorter Machine 02', 'Vibratory size sorter', 'active', 1);

-- Lines in Packing Area
INSERT INTO facility_nodes (id, parent_id, type, name, description, status, assigned_protocol_id) VALUES
(8, 5, 'line', 'Packing Line 01', 'Primary retail box packing line', 'active', 2),
(9, 5, 'line', 'Packing Line 02', 'Bulk export pack line', 'active', 2);
