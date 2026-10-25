import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import csv, io, plib as P
st,_,tx = P.req('POST','/api/expert-preregistration', P.body('semi@fo21.test', organization="Kurum;=cmd|' /C calc'!A0;", fullName="Ali;=1+1;"), headers={'x-forwarded-for':'198.18.0.9'})
print('register', st, tx)
st,_,text = P.req('GET','/api/admin/expert-preregistrations/export.csv?q=semi', headers={'cookie': 'authjs.session-token='+P.JWT['u-admin']})
print('CSV', st); line=[l for l in text.splitlines() if 'semi@' in l][0]; print('raw line:', repr(line))
print('comma parse   :', next(csv.reader([line])))
print('semicolon parse:', next(csv.reader([line], delimiter=';')))
