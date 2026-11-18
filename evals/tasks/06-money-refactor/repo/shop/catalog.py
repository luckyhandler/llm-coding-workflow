from dataclasses import dataclass


@dataclass(frozen=True)
class Product:
    sku: str
    name: str
    price: float
    category: str  # "standard", "reduced" or "exempt"


CATALOG = {
    "COF-1": Product("COF-1", "Coffee beans 1kg", 18.99, "reduced"),
    "MUG-2": Product("MUG-2", "Enamel mug", 12.50, "standard"),
    "BK-3": Product("BK-3", "Brewing guide", 24.95, "reduced"),
    "FLT-4": Product("FLT-4", "Paper filters", 3.35, "standard"),
    "GC-5": Product("GC-5", "Gift card", 25.00, "exempt"),
    "GRN-6": Product("GRN-6", "Hand grinder", 64.90, "standard"),
    "KTL-7": Product("KTL-7", "Gooseneck kettle", 1249.99, "standard"),
}


def get_product(sku):
    try:
        return CATALOG[sku]
    except KeyError:
        raise KeyError(f"unknown sku: {sku}") from None
