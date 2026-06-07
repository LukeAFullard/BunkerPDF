import fitz

doc1 = fitz.open()
page1 = doc1.new_page()
page1.insert_text((50, 50), "This is the first paragraph. It is exactly the same in both documents.", fontsize=12)
page1.insert_text((50, 100), "This is the second paragraph. It will be slightly different in the other document.", fontsize=12)
page1.insert_text((50, 150), "This is the third paragraph. It is exactly the same in both documents.", fontsize=12)

doc2 = fitz.open()
page2 = doc2.new_page()
page2.insert_text((50, 50), "This is the first paragraph. It is exactly the same in both documents.", fontsize=12)
page2.insert_text((50, 100), "This is the second paragraph. It will be SLIGHTLY CHANGED in the other document.", fontsize=12)
page2.insert_text((50, 150), "This is the third paragraph. It is exactly the same in both documents.", fontsize=12)

doc1.save("doc1.pdf")
doc2.save("doc2.pdf")
