// Deliberately badly formatted, to see what the formatter makes of it.
foo(a,b)->a+b;bar(x)->(y=x*2;
        z=y+1;
   [y,z]);
__config()->{'scope'->'player','stay_loaded'->false,'commands'->{'go'->'go'}};
go()->(loop(3,print('tick '+_);sleep(10));
   d=convert_date(unix_time());print(d:2+'/'+d:3));
handlers={'tick'->_()->(if(!global_state,global_state={'n'->0});global_state:'n'=global_state:'n'+1),
          'close'->_()->print('done')};
big=[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30];
nested={'a'->{'b'->{'c'->[1,2,3]}},'list'->[[1,2],[3,4],[5,6]]};
texts='a'//one
+'b'//two
+'c';
last()->(x=1;y=2;x+y)
