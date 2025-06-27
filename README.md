# salesforce-brain-commerce: Braincommerce

This is the repository for the int_brain_commerce integration. This integration enhances the app\_storefront\_base cartridge by providing product data including the following capabilities:

* Shoppers can search for different products in the chat widget where they can get real-time product information  (name, price, availability, etc..).
* Allows customers to search and explore products directly within the chat interface.
* Provides personalized product recommendations based on user queries.

# Cartridge Path Considerations
The int_brain_commerce integration cartridge requires the app\_storefront\_base cartridge. In your cartridge path, include the cartridges in the following order:

```
int_brain_commerce:app_storefront_base
```

# Getting Started

1. Clone this repository. (The name of the top-level folder is int_brain_commerce.)
2. In the top-level int_brain_commerce folder, enter the following command: `npm install`. (This command installs all of the package dependencies required for this integration.)


# Brain Commerce Cartridge Setup Guide

This guide provides instructions to set up the `int_brain_commerce` integration cartridge in a Salesforce B2C Commerce (SFCC) environment.

---

## 🔧 Overview

This cartridge allows integration with Brain Commerce and enables real-time product data access via APIs, used for intelligent features like chat-based product discovery.

---

## 🖥️ Development Environment Setup

1. Clone or download the repository and open it in an IDE (e.g., Visual Studio Code).

---

## 🏗️ Sandbox Configuration

1. Ensure a working SFCC sandbox is available.
2. (Optional) To import default demo sites:  
   Go to `Administration Tools > Site Development > Site Import & Export`,  
   and import the OOTB archive `Storefront Reference Architecture Demo Sites`.

---

## 📦 Import Metadata

1. Create a ZIP archive from the `meta` folder in the repo.
2. Go to `Administration Tools > Site Development > Site Import & Export`.
3. Upload and import the `meta.zip` file.
4. This will set up:
   - System Object Attributes
   - Custom Objects
   - Jobs
   - Services

---

## 🚀 Upload Cartridge to Sandbox

1. In the root of the repository, create a `dw.json` file:

```json
{
  "hostname": "<sandbox_host_name>",
  "username": "<account_manager_username>",
  "password": "<account_manager_password or access_key_token>",
  "code-version": "<active_code_version>",
  "cartridge": ["int_brain_commerce"]
}
```

2. Find your active code version at  
   `Administration Tools > Site Development > Code Deployment`.

3. Upload options:
   - Use the [`sfcc-ci`](https://github.com/SalesforceCommerceCloud/sfcc-ci) CLI tool, or
   - Use the **Prophet** VSCode extension:
     - Install Prophet
     - Use: `Prophet: Enable Upload` under "Prophet Extension > Cartridges"
     - It will detect `dw.json` and upload the cartridge.

> ✅ When prompted about existing cartridges, choose “Leave All Always”.

---

## 🛠️ Cartridge Path Setup

1. Go to `Administration Tools > Sites > Manage Sites > [Your Site] > Settings`.
2. Update the **Cartridge Path** so that:

```
int_brain_commerce
```

...is **to the left of** `app_storefront_base`.

---

## ⚙️ Site Preferences and Service Configuration

1. In Business Manager, select the appropriate site.
2. Navigate to:  
   `Merchant Tools > Site Preferences > Custom Preferences > Brain Commerce Configs`
   - Enable the integration
   - Set required fields such as API host and key

3. Configure **product attribute mapping** in the preference JSON (example):

<details>
<summary>Click to expand mapping</summary>

```json
{
  "systemAttributes": [
    { "sfccAttr": "ID", "brainCommerceAttr": "sku" },
    { "sfccAttr": "ID", "brainCommerceAttr": "sku_id" },
    { "sfccAttr": "availabilityModel.availabilityStatus", "brainCommerceAttr": "availability" },
    { "sfccAttr": "priceModel.price.currencyCode", "brainCommerceAttr": "currency" },
    { "sfccAttr": "pageTitle", "brainCommerceAttr": "title" },
    { "sfccAttr": "shortDescription.source", "brainCommerceAttr": "description" },
    { "sfccAttr": "brand", "brainCommerceAttr": "brand" },
    { "sfccAttr": "online", "brainCommerceAttr": "product_status" }
  ],
  "customAttributes": [
    { "sfccAttr": "size", "brainCommerceAttr": "size" },
    { "sfccAttr": "color", "brainCommerceAttr": "color" },
    { "sfccAttr": "item_group_id", "brainCommerceAttr": "item_group_id" },
    { "sfccAttr": "gender", "brainCommerceAttr": "gender" },
    { "sfccAttr": "material", "brainCommerceAttr": "material" },
    { "sfccAttr": "pattern", "brainCommerceAttr": "pattern" },
    { "sfccAttr": "system_link", "brainCommerceAttr": "system_link" },
    { "sfccAttr": "model", "brainCommerceAttr": "model" },
    { "sfccAttr": "gtin", "brainCommerceAttr": "gtin" },
    { "sfccAttr": "condition", "brainCommerceAttr": "condition" },
    { "sfccAttr": "adult", "brainCommerceAttr": "adult" },
    { "sfccAttr": "summary_review", "brainCommerceAttr": "summary_review" },
    { "sfccAttr": "internal_id", "brainCommerceAttr": "internal_id", "defaultValue": 0 },
    { "sfccAttr": "rrp", "brainCommerceAttr": "rrp", "defaultValue": 0 },
    { "sfccAttr": "product_weight", "brainCommerceAttr": "product_weight", "defaultValue": 0 },
    { "sfccAttr": "average_rating", "brainCommerceAttr": "average_rating", "defaultValue": 0 }
  ]
}
```

</details>

4. Go to:  
   `Administration Tools > Operations > Services > Credentials`  
   Find and configure:  
   `int_braincommerce.http.service` — set the URL to your Brain Commerce API.

---

## 🕒 Jobs

The setup is now complete. Jobs are ready to be **triggered or scheduled**.

> 📝 Note: Jobs can be configured in PIG environments, but **not in sandbox environments**.