export type Product = {
  rowIndex: number;
  sku: string;
  name: string;
  label: string;
  stock: number | null;
};

export type QuantityBucket = {
  /** Pack size / price tier: 25, 50 or 100 */
  quantity: number;
  /** How many orders used this pack size */
  orderCount: number;
  /** How many packs sold (qty / packSize) */
  packCount: number;
};

export type ClientBreakdown = {
  client: string;
  orderCount: number;
  totalQty: number;
  byQuantity: QuantityBucket[];
  orders: {
    date: string;
    city: string;
    payment: string;
    quantity: number;
  }[];
};

export type ProductAnalysis = {
  product: Product;
  orderCount: number;
  clientCount: number;
  totalQty: number;
  byQuantity: QuantityBucket[];
  clients: ClientBreakdown[];
};

export type SaleColumn = {
  colIndex: number;
  client: string;
  date: string;
  city: string;
  payment: string;
};
