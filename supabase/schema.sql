CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source TEXT NOT NULL CHECK (source IN ('caixa', 'leilaoimovel', 'datajud')),
  source_id TEXT NOT NULL,
  title TEXT,
  description TEXT,
  city TEXT,
  state TEXT DEFAULT 'RJ',
  property_type TEXT,
  sale_type TEXT CHECK (sale_type IN ('judicial', 'extrajudicial', 'venda_direta')),
  market_value NUMERIC,
  auction_value NUMERIC,
  discount_pct NUMERIC,
  bedrooms INTEGER,
  area TEXT,
  address TEXT,
  image_url TEXT,
  details_url TEXT,
  edital_url TEXT,
  badge TEXT,
  auction_date TIMESTAMPTZ,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'sold', 'expired')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source, source_id)
);

CREATE INDEX idx_properties_state ON properties(state);
CREATE INDEX idx_properties_city ON properties(city);
CREATE INDEX idx_properties_status ON properties(status);
CREATE INDEX idx_properties_sale_type ON properties(sale_type);
CREATE INDEX idx_properties_source ON properties(source);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER properties_updated_at
  BEFORE UPDATE ON properties
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
