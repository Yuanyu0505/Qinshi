"""Read-only XLSX extraction for the seven additional reference sections.

The workbook is never saved. Source coordinates and explicit user amendments
travel with the generated records. Run with optional workbook/output arguments.
"""
import argparse
import json
from pathlib import Path
import re
import xml.etree.ElementTree as E
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
ATTRS = ['攻', '防', '血', '内力', '追加伤害', '技能穿透', '技伤减免', '暴击', '抗暴击', '真伤抵抗', '中级闪避', '速']
ATTR_LABELS = [a + '%' if 5 <= i <= 10 else a for i, a in enumerate(ATTRS)]


def read_workbook(path):
    with zipfile.ZipFile(path) as z:
        strings = [''.join(x.itertext()) for x in E.fromstring(z.read('xl/sharedStrings.xml'))]
        targets = {x.attrib['Id']: x.attrib['Target'] for x in E.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
        sheets = {}
        for sh in E.fromstring(z.read('xl/workbook.xml')).find('m:sheets', NS):
            target = targets[sh.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
            root = E.fromstring(z.read(target.lstrip('/') if target.startswith('/') else 'xl/' + target))
            cells = {}
            for c in root.findall('m:sheetData/m:row/m:c', NS):
                v = c.find('m:v', NS)
                if v is not None:
                    cells[c.attrib['r']] = strings[int(v.text)] if c.attrib.get('t') == 's' else v.text
            if sh.attrib['name'].strip() == '金蟾试炼':
                # Only copy the worksheet's explicit merged-cell spans. A blank
                # outcome/contribution is not permission to inherit the prior one.
                for merge in root.findall('m:mergeCells/m:mergeCell', NS):
                    match = re.fullmatch(r'([LMNO])(\d+):\1(\d+)', merge.attrib['ref'])
                    if match:
                        col, first, last = match.group(1), int(match.group(2)), int(match.group(3))
                        if f'{col}{first}' in cells:
                            for row in range(first+1,last+1):cells.setdefault(f'{col}{row}',cells[f'{col}{first}'])
            sheets[sh.attrib['name'].strip()] = cells
    return sheets


def num(value):
    if value is None or value == '':
        return None
    v = float(value)
    return int(v) if v.is_integer() else v


def src(sheet, cell):
    return sheet + '!' + cell


def build(sheets):
    data = {'sections': [], 'tables': [], 'firstReleases': [], 'costumes': [], 'fish': [], 'fishTotals': [], 'accountLevels': [], 'awakening': [], 'jinchan': []}
    for ident, title, desc in [
        ('first-releases', '弟子首发', '弟子首发日期与年份查询'),
        ('costumes', '戎装', '弟子与戎装名称对照'),
        ('fishing', '钓鱼', '鱼类属性、强化满级与收集汇总'),
        ('account-levels', '账号升级', '等级经验、体力与升级区间合计'),
        ('disciple-awakening', '弟子升金', '五行觉醒逐段材料与区间合计'),
        ('jinchan', '金蟾试炼', '事件选项、结果与贡献对照'),
        ('sage', '小圣贤庄', '圣贤令估算、兑换与宗师奖励规则')]:
        data['sections'].append({'id': ident, 'name': title, 'description': desc, 'sourcePaths': []})

    def table(ident, section, title, columns, rows, **kwargs):
        item = {'id': ident, 'section': section, 'title': title, 'columns': columns, 'rows': rows, 'sourcePaths': [], 'verification': 'workbook-transcribed'}
        item.update(kwargs)
        source_ranges = {
            'release-dates': ('弟子首发','B2:M27'), 'costume-names': ('戎装','B2:K24'),
            'fishing-species': ('钓鱼','B2:O128'), 'fishing-maxima': ('钓鱼','B2:O128'), 'fishing-totals': ('钓鱼','J2:W8'),
            'account-experience': ('账号升级','A1:F101'), 'awakening-steps': ('弟子升金','A1:E248'),
            'awakening-source-totals': ('弟子升金','A1:E248'), 'jinchan-events': ('金蟾试炼','L10:R122'),
            'jinchan-blessings': ('金蟾试炼','M3:Q7'), 'sage-experience': ('小圣','C5:H35'),
            'sage-store': ('小圣','J2:P34'), 'sage-master-rules': ('小圣','R2:T20')
        }
        if ident in source_ranges:
            item['sourceSheet'], item['sourceRange'] = source_ranges[ident]
        data['tables'].append(item)

    s = sheets['弟子首发']
    for row in range(3, 28):
        for a, b in [('B', 'C'), ('D', 'E'), ('F', 'G'), ('H', 'I'), ('J', 'K'), ('L', 'M')]:
            name, date = s.get(f'{a}{row}', ''), s.get(f'{b}{row}', '')
            if not re.fullmatch(r'\d{4}-\d{1,2}-\d{1,2}', date):
                continue
            date = '-'.join([date.split('-')[0]] + [x.zfill(2) for x in date.split('-')[1:]])
            for person in filter(None, re.split(r'[、\n]', name)):
                data['firstReleases'].append({'id': 'release-' + str(len(data['firstReleases']) + 1), 'name': person.strip(), 'date': date, 'source': src('弟子首发', f'{a}{row}:{b}{row}')})
    for name, date in [('隐虎季布', '2026-08-20'), ('千泷高月', '2026-10-01'), ('雷豹英布', '2026-11-12')]:
        data['firstReleases'].append({'id': 'release-' + str(len(data['firstReleases']) + 1), 'name': name, 'date': date, 'source': '用户补充 2026-11-24'})
    data['firstReleases'].sort(key=lambda x: (x['date'], x['name']), reverse=True)
    table('release-dates', 'first-releases', '弟子首发日期', ['弟子', '首发日期', '年份'], [[x['name'], x['date'], x['date'][:4]] for x in data['firstReleases']])

    s = sheets['戎装']
    for row in range(3, 25):
        for a, b in [('B', 'C'), ('F', 'G'), ('J', 'K')]:
            name = s.get(f'{a}{row}', '').strip()
            if name:
                data['costumes'].append({'id': 'costume-' + str(len(data['costumes']) + 1), 'name': name, 'costume': s.get(f'{b}{row}', '').strip() or '暂缺', 'source': src('戎装', f'{a}{row}:{b}{row}')})
    for name, costume in [('神将威龙且', '九霄御天'), ('神千泷高月', '瑞麟踏焰')]:
        item = next((x for x in data['costumes'] if x['name'] == name), None)
        if item:
            item.update(costume=costume, source='用户补充 2026-11-24')
        else:
            data['costumes'].append({'id': 'costume-' + str(len(data['costumes']) + 1), 'name': name, 'costume': costume, 'source': '用户补充 2026-11-24'})
    table('costume-names', 'costumes', '弟子与戎装', ['弟子', '戎装名称'], [[x['name'], x['costume']] for x in data['costumes']])

    s = sheets['钓鱼']
    blocks = [(3,12,14,'普通（绿）'), (18,27,29,'稀有（蓝）'), (32,35,37,'稀有（蓝）'), (42,53,55,'史诗（紫）'), (58,62,63,'史诗（紫）'), (65,65,66,'史诗（紫）'), (70,91,93,'传说（橙）'), (97,117,119,'神话（红）'), (122,126,127,'神话（红）')]
    maxima = []
    for start, end, maxrow, quality in blocks:
        maxlevel = int(re.search(r'\d+', s[f'B{maxrow}']).group())
        maxstats = {attr: num(s[f'{chr(68+i)}{maxrow}']) for i, attr in enumerate(ATTRS) if f'{chr(68+i)}{maxrow}' in s}
        applicable = s[f'C{start}'] + (f'等{end-start+1}种' if end > start else '')
        maxima.append([quality, applicable, maxlevel] + [maxstats.get(attr, '—') for attr in ATTRS])
        for row in range(start, end+1):
            base = {attr: num(s[f'{chr(68+i)}{row}']) for i, attr in enumerate(ATTRS) if f'{chr(68+i)}{row}' in s and (start != 3 or i < 5)}
            data['fish'].append({'id': f'fish-{row}', 'name': s[f'C{row}'], 'quality': quality, 'base': base, 'max': {attr: maxstats.get(attr) for attr in base}, 'maxLevel': maxlevel, 'source': src('钓鱼', f'C{row}:O{row}'), 'maxSource': src('钓鱼', f'D{maxrow}:O{maxrow}')})
    for row in range(3,9):
        data['fishTotals'].append({'quality': s[f'J{row}'], 'stats': {attr: num(s[f'{chr(75+i)}{row}']) for i, attr in enumerate(ATTRS+['护盾']) if f'{chr(75+i)}{row}' in s}, 'source': src('钓鱼', f'J{row}:W{row}')})
    table('fishing-species', 'fishing', '鱼类属性', ['品质', '名称']+ATTR_LABELS, [[x['quality'], x['name']]+[x['base'].get(a,'—') for a in ATTRS] for x in data['fish']])
    table('fishing-maxima', 'fishing', '强化满级属性', ['品质', '适用鱼类', '满级']+ATTR_LABELS, maxima)
    table('fishing-totals', 'fishing', '品质合计与收集奖励', ['品质']+ATTR_LABELS+['护盾'], [[x['quality']]+[x['stats'].get(a,'—') for a in ATTRS+['护盾']] for x in data['fishTotals']])

    s = sheets['账号升级']
    for row in range(2,102):
        level = num(s.get(f'A{row}'))
        if not isinstance(level, int):
            continue
        data['accountLevels'].append({'level': level, 'experience': num(s.get(f'B{row}')), 'perStamina': num(s.get(f'C{row}')), 'stamina': num(s.get(f'D{row}')), 'chickens': num(s.get(f'F{row}')), 'source': src('账号升级', f'A{row}:F{row}')})
    table('account-experience', 'account-levels', '逐级升级需求', ['当前等级', '目标等级', '经验需求', '每体力经验', '体力需求', '烤山鸡取整'], [[x['level'], x['level']+1 if x['level']<100 else '上限', x['experience'] if x['experience'] is not None else '—', x['perStamina'] if x['perStamina'] is not None else '—', x['stamina'] if x['stamina'] is not None else '—', x['chickens'] if x['chickens'] is not None else '—'] for x in data['accountLevels']])

    s = sheets['弟子升金']
    for element, start in [('金',1),('木',51),('水',101),('火',151),('土',201)]:
        for row in range(start+1,start+48):
            raw = s.get(f'A{row}', '')
            if '→' not in raw:
                continue
            a,b = raw.replace('\n','').split('→')
            mats, corrections, issues = {}, [], []
            for col in 'BCDE':
                value = s.get(f'{col}{row}', '').strip()
                if not value:
                    continue
                if col=='B' and row==9:
                    corrections.append({'source': '弟子升金!B9', 'original': value, 'corrected': '10艮山之尘', 'reason': '用户确认 2026-11-24'})
                    value = '10艮山之尘'
                if element == '火' and row == 152 and col == 'D':
                    corrections.append({'source': '弟子升金!D152', 'original': value, 'corrected': '2震雷之尘', 'reason': '用户确认 2026-11-27'})
                    value = '2震雷之尘'
                if element == '木' and row == 59 and value == '10乾天之':
                    corrections.append({'source': src('弟子升金', f'{col}{row}'), 'original': value, 'corrected': '10乾天之尘', 'reason': '用户确认 2026-11-27'})
                    value = '10乾天之尘'
                match = re.fullmatch(r'(\d+)\s*([^\d]+)', value)
                if not match:
                    issues.append({'source': src('弟子升金',f'{col}{row}'), 'text':value})
                    continue
                name, count = match.group(2).strip(), int(match.group(1))
                mats[name] = mats.get(name,0)+count
            data['awakening'].append({'element':element,'from':a,'to':b,'materials':[{'name':k,'count':v} for k,v in mats.items()],'source':src('弟子升金',f'A{row}:E{row}'),'corrections':corrections,'issues':issues})
    table('awakening-steps', 'disciple-awakening', '逐段觉醒材料', ['五行','起点','终点','材料'], [[x['element'],x['from'],x['to'],'、'.join(m['name']+'×'+str(m['count']) for m in x['materials'])] for x in data['awakening']])
    totals=[]
    data['sourceDiscrepancies']=[]
    for a,b in [('H','I'),('K','L'),('N','O'),('Q','R'),('T','U')]:
        element=s[f'{a}2']
        for row in range(3,25):
            name=s.get(f'{a}{row}'); count=num(s.get(f'{b}{row}'))
            if name and count is not None:
                totals.append([element,name,count])
                relevant=[step for step in data['awakening'] if step['element']==element]
                known=sum(m['count'] for step in relevant for m in step['materials'] if m['name']==name)
                complete=not any(name in issue['text'] for step in relevant for issue in step['issues'])
                if known!=count or not complete:
                    data['sourceDiscrepancies'].append({'element':element,'name':name,'sourceCount':count,'stepCount':known if complete else None,'knownSubtotal':known,'complete':complete,'source':src('弟子升金',f'{a}{row}:{b}{row}')})
    # Workbook summary counts remain historical metadata only; all active totals
    # are derived from the user-corrected individual stages.
    totals = []
    for element in ['金', '木', '水', '火', '土']:
        summed = {}
        for step in data['awakening']:
            if step['element'] == element:
                for material in step['materials']:
                    summed[material['name']] = summed.get(material['name'], 0) + material['count']
        totals.extend([element, name, count] for name, count in summed.items())
    table('awakening-source-totals','disciple-awakening','0至9星合计',['五行','材料','数量'],totals,verification='derived-from-user-corrected-steps')

    s = sheets['金蟾试炼']
    place=event=choice=''
    for row in range(12,123):
        p=s.get(f'L{row}')
        if p in ['矿坑','森林','栈道','城邦','城郭']:place='城邦' if p=='城郭' else p;event=choice=''
        if s.get(f'M{row}')=='事件':continue
        if s.get(f'M{row}'):event=s[f'M{row}'];choice=''
        if s.get(f'N{row}'):choice=s[f'N{row}']
        result=s.get(f'O{row}','')
        if not place or not event or not choice or not result:continue
        data['jinchan'].append({'id':f'jinchan-{row}','place':place,'sourcePlace': '城郭' if place=='城邦' else place,'event':event,'choice':choice,'result':result,'reward':s.get(f'P{row}','—'),'contribution':s.get(f'Q{row}','—'),'source':src('金蟾试炼',f'L{row}:R{row}')})
    table('jinchan-events','jinchan','事件与选项',['地点','事件','处理选项','结果','加成／掉落','贡献'],[[x['place'],x['event'],x['choice'],x['result'],x['reward'],x['contribution']] for x in data['jinchan']])
    table('jinchan-blessings','jinchan','地点与祝福',['地点','属性加成','产出祝福','祝福加成','比例'],[[s[f'{c}3'],s[f'{c}4'],s[f'{c}5'],s[f'{c}6'],str(num(s[f'{c}7'])*100)+'%'] for c in 'NOPQ'])

    s = sheets['小圣']
    data['sage']={'days':27,'weeks':4,'cumulative':False,'masterMultiplier':3,'stamina':[[50,30],[100,60],[150,90]],'activity':[[10,20],[15,30],[25,50],[40,80],[50,100]],'weeklySpend':[[5000,500],[10000,800],[30000,4000]],'weeklyRecharge':[[30,500],[198,800],[648,4000]],'rechargeExperiencePerYuan':1,'corrections':[{'source':'小圣!C7','original':10,'corrected':100,'reason':'用户确认 2026-11-24'},{'source':'小圣!C5:H35','reason':'用户于2026-11-27修订：同项目每次只领取符合条件的最高档奖励，不累加低档奖励'}]}
    table('sage-experience','sage','经验与圣贤令',['项目','达到条件','经验奖励','周期'],[[label,value,xp,period] for key,label,period in [('stamina','日消耗体力','每日'),('activity','日活跃度','每日'),('weeklySpend','周消费元宝','每周'),('weeklyRecharge','周累计充值','每周')] for value,xp in data['sage'][key]]+[['充值额外经验','每充值1元',1,'按4周充值总额'],['圣贤令','每100经验','得1圣贤令','最终向下取整'],['宗师奖励','圣贤令倍率','3倍圣贤令','198元购买且计入累计充值']])
    store=[]
    for row in range(5,35):
        name=s.get(f'J{row}',''); quantity=num(s.get(f'L{row}')); price=num(s.get(f'M{row}')); limit=num(s.get(f'N{row}'))
        if not name or quantity is None:continue
        band = 0 if row < 12 else 60 if row < 20 else 180 if row < 28 else 300
        store.append([band,name,quantity,price,limit,num(s.get(f'O{row}')),num(s.get(f'P{row}'))])
    table('sage-store','sage','商城兑换',['消耗圣贤令数量','商品','每份数量','单价','兑换上限','总数量','总价'],store)
    rules=[]
    for row in range(4,21):
        if s.get(f'S{row}'):rules.append([s.get(f'S{row}'),s.get(f'T{row}','—')])
    table('sage-master-rules','sage','宗师奖励计入规则',['项目','原表规则'],rules)
    data['meta']={'sourceFile':'秦时相关（更新贯侯钟离昧）20260618.xlsx','sourceSheets':['弟子首发','戎装','钓鱼','账号升级','弟子升金','金蟾试炼','小圣'],'confirmedAt':'2026-11-24'}
    return data


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('workbook',nargs='?',default=str(ROOT/'测试'/'秦时相关（更新贯侯钟离昧）20260618.xlsx'))
    parser.add_argument('--output',default=str(ROOT/'data'/'reference-expansion.js'))
    args=parser.parse_args()
    data=build(read_workbook(args.workbook))
    output='/* Generated by tools/build_reference_expansion.py; source workbook remains read-only. */\n(function(root,factory){var data=factory();if(typeof module===\'object\'&&module.exports)module.exports=data;if(root)root.REFERENCE_EXPANSION_DATA=data;})(typeof globalThis!==\'undefined\'?globalThis:this,function(){return '+json.dumps(data,ensure_ascii=False,indent=2)+';});\n'
    Path(args.output).write_text(output,encoding='utf-8')
    print(json.dumps({key:len(value) for key,value in data.items() if isinstance(value,list)},ensure_ascii=False))


if __name__=='__main__':main()
