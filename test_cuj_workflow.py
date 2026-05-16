import fitz

doc = fitz.open()
page = doc.new_page()
page.insert_text((50, 50), "Hello World Workflow Test Document")

doc.save("test_document.pdf")
doc.close()
