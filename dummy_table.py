import fitz # PyMuPDF
doc = fitz.open()
page = doc.new_page()

# Draw a simple table on the page
rect = fitz.Rect(100, 100, 400, 200)

# We just write some text that looks like a table
# PyMuPDF table extraction requires text aligned in a grid
text = """Col1    Col2    Col3
A       B       C
D       E       F
G       H       I
"""
page.insert_textbox(rect, text, fontsize=12)

# It's better to use something that actually draws lines so it's reliably detected
shape = page.new_shape()
shape.draw_rect(fitz.Rect(100, 100, 400, 200))
# Horizontal lines
shape.draw_line(fitz.Point(100, 125), fitz.Point(400, 125))
shape.draw_line(fitz.Point(100, 150), fitz.Point(400, 150))
shape.draw_line(fitz.Point(100, 175), fitz.Point(400, 175))
# Vertical lines
shape.draw_line(fitz.Point(200, 100), fitz.Point(200, 200))
shape.draw_line(fitz.Point(300, 100), fitz.Point(300, 200))
shape.finish()
shape.commit()

# Add text to cells
page.insert_text(fitz.Point(110, 115), "Header 1")
page.insert_text(fitz.Point(210, 115), "Header 2")
page.insert_text(fitz.Point(310, 115), "Header 3")

page.insert_text(fitz.Point(110, 140), "Data 1")
page.insert_text(fitz.Point(210, 140), "Data 2")
page.insert_text(fitz.Point(310, 140), "Data 3")

doc.save("dummy_table.pdf")
