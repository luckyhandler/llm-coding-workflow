import unittest

from shop.cart import Cart
from shop.catalog import CATALOG
from shop.invoice import build_invoice, render_invoice
from shop.money import format_cents, round_half_up

EXPECTED_PRICES = {
    "COF-1": 1899, "MUG-2": 1250, "BK-3": 2495, "FLT-4": 335,
    "GC-5": 2500, "GRN-6": 6490, "KTL-7": 124999,
}


def _ints(inv):
    yield from (inv[k] for k in ("subtotal_cents", "discount_cents", "tax_cents", "total_cents"))
    for line in inv["lines"]:
        yield from (line[k] for k in ("unit_cents", "gross_cents", "discount_cents", "net_cents", "tax_cents"))


class HiddenShopTest(unittest.TestCase):
    def test_catalog_prices_exact(self):
        for sku, cents in EXPECTED_PRICES.items():
            with self.subTest(sku=sku):
                self.assertIs(type(CATALOG[sku].price_cents), int)
                self.assertEqual(CATALOG[sku].price_cents, cents)

    def test_round_half_up_is_not_bankers(self):
        self.assertEqual(round_half_up(10, 4), 3)
        self.assertEqual(round_half_up(-10, 4), -3)
        self.assertEqual(round_half_up(1, 2), 1)
        self.assertEqual(round_half_up(7, 4), 2)
        self.assertEqual(round_half_up(0, 7), 0)
        self.assertEqual(round_half_up(10**20 + 1, 2), 5 * 10**19 + 1)

    def test_format_cents_more(self):
        self.assertEqual(format_cents(123456789), "1,234,567.89")
        self.assertEqual(format_cents(-123456), "-1,234.56")
        self.assertEqual(format_cents(7), "0.07")
        self.assertEqual(format_cents(100000), "1,000.00")

    def test_large_invoice(self):
        cart = Cart()
        cart.add("KTL-7", 2)
        cart.add("FLT-4", 5)
        inv = build_invoice(cart, coupon_percent=15)
        self.assertEqual(
            [(l["gross_cents"], l["discount_cents"], l["net_cents"], l["tax_cents"]) for l in inv["lines"]],
            [(249998, 37500, 212498, 40375), (1675, 251, 1424, 271)],
        )
        self.assertEqual(inv["total_cents"], 254568)
        text = render_invoice(inv)
        self.assertIn("KTL-7  Gooseneck kettle     2 x  1,249.99    2,499.98", text)
        self.assertIn("Total                                       2,545.68", text)

    def test_coupon_rounds_half_up_per_line(self):
        cart = Cart()
        cart.add("MUG-2")
        inv = build_invoice(cart, coupon_percent=1)
        line = inv["lines"][0]
        self.assertEqual(line["discount_cents"], 13)
        self.assertEqual(line["net_cents"], 1237)
        self.assertEqual(line["tax_cents"], 235)

    def test_deal_before_coupon_and_only_for_deal_skus(self):
        cart = Cart()
        cart.add("FLT-4", 7)
        cart.add("GRN-6", 3)
        inv = build_invoice(cart, coupon_percent=20, deal_skus=("FLT-4",))
        flt, grn = inv["lines"]
        self.assertEqual(flt["discount_cents"], 2 * 335 + round_half_up((7 * 335 - 2 * 335) * 20, 100))
        self.assertEqual(grn["discount_cents"], round_half_up(3 * 6490 * 20, 100))

    def test_all_amounts_are_ints(self):
        cart = Cart()
        cart.add("BK-3", 4)
        cart.add("GC-5", 2)
        for kwargs in ({}, {"coupon_percent": 33}, {"deal_skus": ("BK-3",)}, {"deal_skus": ("NOPE",)}):
            with self.subTest(**kwargs):
                inv = build_invoice(cart, **kwargs)
                for value in _ints(inv):
                    self.assertIs(type(value), int)
                self.assertEqual(
                    inv["total_cents"],
                    inv["subtotal_cents"] - inv["discount_cents"] + inv["tax_cents"],
                )

    def test_empty_cart(self):
        inv = build_invoice(Cart())
        self.assertEqual(inv["lines"], [])
        self.assertEqual(inv["total_cents"], 0)
        self.assertIs(type(Cart().subtotal()), int)

    def test_cart_behaviour_preserved(self):
        cart = Cart()
        with self.assertRaises(ValueError):
            cart.add("MUG-2", 0)
        with self.assertRaises(KeyError):
            cart.add("NOPE")
        cart.add("MUG-2")
        cart.add("COF-1", 2)
        cart.add("MUG-2", 2)
        self.assertEqual([(p.sku, q) for p, q in cart.lines()], [("MUG-2", 3), ("COF-1", 2)])


if __name__ == "__main__":
    unittest.main()
