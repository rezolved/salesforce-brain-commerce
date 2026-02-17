# Changelog

## 1.0.3 (May 28, 2025)

➕ Added Optional Products to ingestion process

🛠️ Fixed listPrice value 

## 1.0.7 (July 24, 2025)

➕ Added support for exporting Variation Group products.
The system now indexes Variation Group products along with their associated variants, enabling more structured product grouping.

➕ Added configurable product image types.
Merchants can now define which image types (e.g., large, main, thumbnail) should be exported for each product.

🔧 Removed jQuery usage from the storefront.
Replaced jQuery-dependent scripts with native JavaScript to improve performance and compatibility.

⏱️ Extended job timeout limits.
Increased allowed execution time for product export jobs, enabling full catalog indexing for merchants with large product datasets.

🛠️ Miscellaneous minor fixes and enhancements
