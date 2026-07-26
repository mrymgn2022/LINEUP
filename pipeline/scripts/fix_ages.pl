#!/usr/bin/perl
# =============================================================================
# fix_ages.pl — メンバーサイトの「年齢」列を生年月日から再計算して補正する
#   なぜ必要か: アプリは起動時に refreshAges() で毎回自動計算するので常に正しいが、
#               メンバーサイトは静的HTMLなので生成時の年齢が固定され、日々ズレていく。
#   正の源泉  : docs/index.html の BIRTH（"Name|NAT":"YYYY-MM-DD"）
#   対象      : docs/clubs/*.html と docs/en/clubs/*.html の選手表の年齢セル
#               ※ J1系ページは年齢でなく「生年月日」列なので対象外（陳腐化しない）
#               ※ 代表ページ(.sqn)は年齢列なし
#   安全策    : 同名が複数いる選手は触らない／BIRTH未登録は据え置き／冪等
#   使い方    : perl pipeline/scripts/fix_ages.pl [--dry]
#   運用      : 月1で実行（誕生日を跨いだ選手だけが直る）
# =============================================================================
use strict; use warnings;

my $DRY = grep { $_ eq '--dry' } @ARGV;
my $ROOT = 'G:/共有ドライブ/Alfaras（株）/football lineup【2】';
my $docs = "$ROOT/docs";

sub slurp { my $p=shift; open my $f,'<:raw',$p or die "$p: $!"; local $/; my $c=<$f>; close $f; $c }
sub spit  { my($p,$c)=@_; open my $o,'>:raw',$p or die "$p: $!"; print $o $c; close $o }

# ---- 1) BIRTH を読む（const BIRTH と Object.assign(BIRTH,...) の両方） ----
my $idx = slurp("$docs/index.html");
my %birth;
while($idx =~ /"((?:[^"\\]|\\.)+)":"(\d{4}-\d{2}-\d{2})"/g){ $birth{$1} = $2 }
die "BIRTHが読めない\n" unless keys(%birth) > 1000;

# 名前（ローマ字）→ 生年月日。同名で異なるDOBがある場合は「曖昧」として除外
my (%dob, %ambig);
for my $k (keys %birth){
  my $nm = $k; $nm =~ s/\|.*$//;
  if(exists $dob{$nm}){ $ambig{$nm}=1 if $dob{$nm} ne $birth{$k}; }
  else { $dob{$nm} = $birth{$k} }
}
printf "BIRTH: %d件 / 名前索引: %d件 (同名で曖昧: %d件は対象外)\n",
       scalar(keys %birth), scalar(keys %dob), scalar(keys %ambig);

# ---- 2) 今日時点の年齢 ----
my @t = localtime(); my ($TY,$TM,$TD) = ($t[5]+1900, $t[4]+1, $t[3]);
sub age_now {
  my ($y,$m,$d) = shift =~ /^(\d{4})-(\d{2})-(\d{2})$/ or return undef;
  my $a = $TY - $y;
  $a-- if ($TM < $m) || ($TM == $m && $TD < $d);
  return ($a >= 0 && $a < 120) ? $a : undef;
}

# ---- 3) 対象ファイル ----
my @files;
for my $dir ('clubs','en/clubs'){
  opendir(my $dh, "$docs/$dir") or die "$dir: $!";
  for my $f (sort readdir $dh){ push @files, "$dir/$f" if $f =~ /\.html$/ && $f ne 'index.html' }
  closedir $dh;
}

# ---- 4) 置換 ----
my ($nfix,$npage,@log) = (0,0);
for my $rel (@files){
  my $path = "$docs/$rel";
  my $c = slurp($path);
  my $orig = $c;

  for my $nm (sort keys %dob){
    next if $ambig{$nm};
    my $real = age_now($dob{$nm}); next unless defined $real;
    my $q = quotemeta($nm);
    # 名前セルの直後にある年齢セルだけを対象にする。
    # 表形式が3種あるので両方のパターンを全ファイルに当てる（ディレクトリで決め打ちしない）:
    #   A: カナ+ローマ字（JAの標準）  <td>番号</td><td>カナ<span class="en">Roman</span></td><td>年齢</td>
    #   B: ローマ字のみ（ENと、旧フォーマットのJA=leverkusen/marseille/newcastle）
    #      <td>番号 or ポジション</td><td>Roman</td><td>年齢</td>
    for my $re (
      qr{(<td>[^<]*</td><td>[^<]*<span class="en">$q</span></td><td>)(\d+)(</td>)},
      qr{(<td>[^<]*</td><td>$q</td><td>)(\d+)(</td>)},
    ){
      $c =~ s{$re}{
        my ($pre,$old,$post) = ($1,$2,$3);
        if($old != $real){ $nfix++; push @log, "$rel: $nm  $old→$real"; }
        $pre.$real.$post;
      }ge;
    }
  }
  if($c ne $orig){ $npage++; spit($path,$c) unless $DRY; }
}

print "\n=== 補正 ".($DRY?"(DRY RUN)":"")." ===\n";
print "  $_\n" for @log;
printf "\n%d件を補正 / %dページ更新%s\n", $nfix, $npage, ($DRY ? " ※ドライラン（未書込）" : "");
