-- DATABASE INITIALIZATION

-- Drop tables in reverse order of dependency
DROP TABLE IF EXISTS pool_members;
DROP TABLE IF EXISTS pools;
DROP TABLE IF EXISTS bank_entries;
DROP TABLE IF EXISTS ship_compliance;
DROP TABLE IF EXISTS routes;

-- 1. Routes Table (Updated for functional requirements)
CREATE TABLE routes (
    id SERIAL PRIMARY KEY,
    route_id VARCHAR(50) NOT NULL,
    year INT NOT NULL,
    vessel_type VARCHAR(50),    -- NEW
    fuel_type VARCHAR(50),      -- NEW
    ghg_intensity FLOAT NOT NULL,
    fuel_consumption_t FLOAT,   -- NEW
    distance_km FLOAT,          -- NEW
    total_emissions_t FLOAT,    -- NEW
    is_baseline BOOLEAN DEFAULT FALSE,
    UNIQUE(route_id, year)
);

-- 2. Compliance Table
CREATE TABLE ship_compliance (
    id SERIAL PRIMARY KEY,
    ship_id VARCHAR(50) NOT NULL,
    year INT NOT NULL,
    cb_gco2eq FLOAT NOT NULL,
    UNIQUE(ship_id, year)
);

-- 3. Banking Table (Updated to track usage)
CREATE TABLE bank_entries (
    id SERIAL PRIMARY KEY,
    ship_id VARCHAR(50) NOT NULL,
    year INT NOT NULL, -- Year EARNED
    amount_gco2eq FLOAT NOT NULL,
    amount_used FLOAT DEFAULT 0 NOT NULL -- NEW
);

-- 4. Pooling Tables
CREATE TABLE pools (
    id SERIAL PRIMARY KEY,
    year INT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE pool_members (
    pool_id INT REFERENCES pools(id),
    ship_id VARCHAR(50) NOT NULL,
    cb_before FLOAT NOT NULL,
    cb_after FLOAT NOT NULL,
    PRIMARY KEY (pool_id, ship_id)
);

-- SEED DATA
INSERT INTO routes (route_id, year, vessel_type, fuel_type, ghg_intensity, fuel_consumption_t, distance_km, total_emissions_t, is_baseline) VALUES
('R1_EU_HFO', 2025, 'Container', 'HFO', 94.0, 5000, 12000, 15000, TRUE),
('R2_EU_MGO', 2025, 'Bulk Carrier', 'MGO', 89.0, 4500, 11000, 14000, FALSE),
('R3_EU_LNG', 2025, 'RoPax', 'LNG', 76.0, 4000, 8000, 11000, FALSE),
('R4_EU_BIO', 2025, 'Container', 'Bio-Methanol', 15.0, 5200, 12000, 2500, FALSE),
('R5_TRANS_ATL', 2025, 'Tanker', 'VLSFO', 88.5, 6000, 15000, 17500, FALSE)
ON CONFLICT DO NOTHING;

INSERT INTO ship_compliance (ship_id, year, cb_gco2eq) VALUES
('SHIP_A_SURPLUS', 2025, 5000),
('SHIP_B_DEFICIT', 2025, -2000),
('SHIP_C_DEFICIT', 2025, -1000),
('SHIP_D_NEUTRAL', 2025, 100)
ON CONFLICT DO NOTHING;