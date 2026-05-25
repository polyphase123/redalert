import pandas as pd
xls = pd.ExcelFile('Plants on Outage in Luzon and Visayas grids on 12-18 May 2026(1).xlsx')
print(xls.sheet_names)
