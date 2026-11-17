from shop.catalog import get_product


class Cart:
    def __init__(self):
        self._lines = {}

    def add(self, sku, qty=1):
        if qty <= 0:
            raise ValueError("qty must be positive")
        get_product(sku)  # unknown SKUs raise KeyError
        self._lines[sku] = self._lines.get(sku, 0) + qty

    def lines(self):
        """(product, qty) pairs in the order SKUs were first added."""
        return [(get_product(sku), qty) for sku, qty in self._lines.items()]

    def subtotal(self):
        return sum(product.price * qty for product, qty in self.lines())
