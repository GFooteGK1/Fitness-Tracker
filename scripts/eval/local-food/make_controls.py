"""Reproduce owned synthetic controls. They are not real-world privacy evidence."""
import argparse
import hashlib
from pathlib import Path
from PIL import Image, ImageDraw
from fetch import image_path

CONTROLS = [
    ("synthetic-01", "document", "INVOICE\nOffice stationery\nPaper 12.00\nPens 4.00\nTOTAL 16.00", False),
    ("synthetic-02", "nutrition_document", "NUTRITION FACTS\nGranola cereal\nProtein 10 g\nCarbohydrate 32 g\nFat 9 g", False),
    ("synthetic-03", "screen", "SHOPPING\nMilk\nBread\nRice\nADD TO CART", True),
    ("synthetic-04", "screen", "DAILY FOOD LOG\nBreakfast\nProtein 30 g\nCalories 450\nSAVE", False),
    ("synthetic-05", "abstract", "", False),
    ("synthetic-06", "abstract", "", False),
]


def render(identifier, category, text):
    image = Image.new("RGB", (512, 512), "white" if category != "abstract" else "#909090")
    draw = ImageDraw.Draw(image)
    if category == "screen":
        draw.rounded_rectangle((60, 10, 452, 502), radius=24, fill="#222222")
        draw.rectangle((80, 40, 432, 470), fill="#eeeeee")
    if text:
        draw.multiline_text((100 if category == "screen" else 32, 72), text, fill="black", spacing=24,
                            font_size=24)
    if identifier == "synthetic-06":
        for i, color in enumerate(["red", "blue", "green", "yellow"]):
            draw.rectangle((i * 128, 0, (i + 1) * 128 - 1, 511), fill=color)
    return image


def generate(root):
    rows = []
    for identifier, category, text, screenshot in CONTROLS:
        target = image_path(root, "synthetic/" + identifier + ".png")
        target.parent.mkdir(parents=True, exist_ok=True)
        import io
        buffer = io.BytesIO(); render(identifier, category, text).save(buffer, format="PNG")
        data = buffer.getvalue()
        if target.exists():
            if target.read_bytes() != data: raise ValueError("Existing control differs; preserve and investigate")
        else:
            with target.open("xb") as handle: handle.write(data)
        rows.append(dict(id=identifier, file="synthetic/" + identifier + ".png",
            sha256=hashlib.sha256(data).hexdigest(), category=category, group=identifier,
            split="development", layer="synthetic", expectedPresence="nonFood", clearMeal=False,
            sensitive=category != "abstract", isScreenshot=screenshot,
            source="Owned synthetic control; make_controls.py, Pillow 11.3.0", license="CC0", author="SociusFit evaluation",
            labelRationale="Drawn text or shapes, no real edible item. Synthetic screen is a control, not a photograph of a real screen."))
    return rows


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument("image_directory")
    args = parser.parse_args()
    for row in generate(args.image_directory): print(row["id"], row["sha256"])
