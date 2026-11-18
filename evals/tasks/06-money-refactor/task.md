The `shop` package computes invoices with floating-point amounts, which gives
off-by-one-cent totals. Migrate it to integer cents end to end so all tests in
`test_money.py` and `test_invoice.py` pass.

Requirements:
- Add `shop/money.py` with:
  - `round_half_up(numerator, denominator)`: integer division rounded to the
    nearest int, halves away from zero (`round_half_up(5, 2) == 3`,
    `round_half_up(-5, 2) == -3`). Integer arithmetic only.
  - `format_cents(cents)`: `123456` -> `"1,234.56"`, `-5` -> `"-0.05"`,
    `0` -> `"0.00"`.
- `Product.price` becomes `Product.price_cents` (an `int`). Convert every catalog
  price exactly (18.99 must become 1899).
- `Cart.subtotal()` returns `int` cents. Keep the cart's existing validation and
  ordering behaviour.
- `build_invoice(cart, coupon_percent=0, deal_skus=())` returns only ints for
  amounts and computes each cart line, in cart order, as:
  1. `gross = price_cents * qty`
  2. 3-for-2 deal, only for SKUs in `deal_skus`: `deal = (qty // 3) * price_cents`
  3. coupon on what is left: `coupon = round_half_up((gross - deal) * coupon_percent, 100)`
  4. `net = gross - deal - coupon`
  5. `tax = round_half_up(net * rate, 100)` with the rate of the product's category
  Each line dict has the keys `sku`, `name`, `qty`, `unit_cents`,
  `gross_cents`, `discount_cents` (deal + coupon), `net_cents` and
  `tax_cents`. The invoice totals are the sums over lines: `subtotal_cents` (gross),
  `discount_cents` (deal + coupon), `tax_cents`, and
  `total_cents = subtotal_cents - discount_cents + tax_cents`.
- `render_invoice` keeps its layout; amounts are printed with `format_cents`.
- No `float` may appear in any amount the package returns. Keep the existing
  module structure (catalog, cart, discounts, tax, invoice) and put the pricing
  rules in the module that owns them.

Do not change the tests.
