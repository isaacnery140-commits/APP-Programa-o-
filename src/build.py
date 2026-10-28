# Monta o index.html a partir do codigo-fonte. Rode na raiz do repositorio: python3 src/build.py
p=open('src/page.src.html').read(); g=open('src/gen.js').read(); t=open('data/template.json').read()
g=g.replace("if (typeof module !== 'undefined') module.exports = RAYNEN;",'')
p=(p.replace('/*GEN*/',g).replace('/*TEMPLATE*/',t).replace('/*LIBRARY*/',open('data/library.json').read()).replace('/*JQEX*/',open('data/jq_example.json').read())
   .replace('*{box-sizing:border-box}','*{box-sizing:border-box}\n[hidden]{display:none!important}',1))
head='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>'
open('index.html','w').write(head+p+'</body></html>'); print(len(p))
