import unittest

from shop.cart import Cart
from shop.invoice import build_invoice, render_invoice


def _cart():
    cart = Cart()
    cart.add("COF-1", 3)
    cart.add("MUG-2")
    cart.add("GC-5")
    return cart


class InvoiceTest(unittest.TestCase):
    def test_subtotal_is_int_cents(self):
        subtotal = _cart().subtotal()
        self.assertIsInstance(subtotal, int)
        self.assertEqual(subtotal, 9447)

    def test_totals(self):
        inv = build_invoice(_cart(), coupon_percent=10, deal_skus=("COF-1",))
        self.assertEqual(inv["subtotal_cents"], 9447)
        self.assertEqual(inv["discount_cents"], 2654)
        self.assertEqual(inv["tax_cents"], 453)
        self.assertEqual(inv["total_cents"], 7246)

    def test_lines(self):
        inv = build_invoice(_cart(), coupon_percent=10, deal_skus=("COF-1",))
        coffee = inv["lines"][0]
        self.assertEqual(coffee["sku"], "COF-1")
        self.assertEqual(coffee["gross_cents"], 5697)
        self.assertEqual(coffee["discount_cents"], 1899 + 380)
        self.assertEqual(coffee["net_cents"], 3418)
        self.assertEqual(coffee["tax_cents"], 239)

    def test_render(self):
        inv = build_invoice(_cart(), coupon_percent=10, deal_skus=("COF-1",))
        expected = "\n".join([
            "COF-1  Coffee beans 1kg     3 x     18.99       56.97",
            "MUG-2  Enamel mug           1 x     12.50       12.50",
            "GC-5   Gift card            1 x     25.00       25.00",
            "----------------------------------------------------",
            "Subtotal                                       94.47",
            "Discount                                      -26.54",
            "Tax                                             4.53",
            "Total                                          72.46",
        ])
        self.assertEqual(render_invoice(inv), expected)


if __name__ == "__main__":
    unittest.main()
